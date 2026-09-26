import "server-only";
import { parseOpeningHours } from "@/domain/opening-hours";
import { osmArea } from "./osm-reverse";
import { overpassHelp, overpassNearby, photonSearch } from "./osm-live";
import { HELP_CLASSES, dedupeHelpPoints, helpClassFromOsm, isOpen24h, type HelpPoint } from "@/domain/help-points";
import { nominatimSearch } from "./osm-reverse";
import { rankPlaces } from "@/domain/search-rank";
import type postgres from "postgres";
import { haversineMeters, inBounds } from "@/domain/pilot";
import { pathCoords, planRoutes, WALKING_SPEED_KMH } from "@/domain/routing";
import { displayName } from "@/domain/know-copy";
import { loadGraph } from "@/server/know/graph";
import type { GeoPoint, GeoProvider, ModeRoute, PlaceHit, WalkRoute } from "./types";

/**
 * Placeholder maps provider. Uses MIRA's own OpenStreetMap snapshot (real places and a
 * real walking graph) where it has data; everywhere else it is honest: search finds
 * nothing, reverse geocoding returns no label (the map names the area), and routes are straight-line
 * estimates flagged `approximate`. Mapbox replaces this without UI changes.
 */
export function placeholderGeo(sql: postgres.Sql): GeoProvider {
  type Row = { id: string; name: string | null; place_type: string; kind: string | null; lat: number; lon: number; hours: string | null; d: number };
  const toHit = (r: Row): PlaceHit => ({
    id: r.id,
    name: displayName(r.name, r.kind ?? "Place"),
    kind: r.kind ?? r.place_type,
    lat: r.lat,
    lon: r.lon,
    distanceM: Math.round(r.d),
    hours: r.hours,
  });

  const walkRoutes = async (a: GeoPoint, b: GeoPoint): Promise<WalkRoute[]> => {
    const graph = await loadGraph(sql).catch(() => null);
    if (graph) {
      const plan = planRoutes(graph, a, b);
      if (plan.ok && plan.routes.length) {
        return plan.routes.map((r) => ({
          meters: Math.round(r.lengthM),
          minutes: r.minutes,
          geometry: [[a.lon, a.lat], ...pathCoords(graph, r.path).map((c) => [c.lon, c.lat] as [number, number]), [b.lon, b.lat]],
          approximate: false,
        }));
      }
    }
    // Straight line with a typical street-network detour factor.
    const meters = Math.round(haversineMeters(a, b) * 1.3);
    return [{ meters, minutes: Math.max(1, Math.ceil(meters / ((WALKING_SPEED_KMH * 1000) / 60))), geometry: [[a.lon, a.lat], [b.lon, b.lat]], approximate: true }];
  };

  return {
    async search(q, near, opts) {
      const term = q.normalize("NFKC").trim().toLowerCase().slice(0, 80);
      if (term.length < 2) return [];
      const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const lat = near?.lat ?? 0;
      const lon = near?.lon ?? 0;
      const rows = await sql<Row[]>`
        SELECT id, name, place_type, tags->>'mira:kind' AS kind, tags->>'opening_hours' AS hours,
               ST_Y(point) AS lat, ST_X(point) AS lon,
               ${near ? sql`ST_Distance(point::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)` : sql`0`} AS d
        FROM places
        WHERE name IS NOT NULL AND (search_text ILIKE ${like} OR search_text % ${term})
        ORDER BY (search_text ILIKE ${term + "%"}) DESC, similarity(search_text, ${term}) DESC
        LIMIT 12`;
      const local = rows.map(toHit);
      // Always ask live OSM too (the local snapshot is small), and on an explicit search also
      // Nominatim; then rank by how well the name matches, with distance only breaking ties.
      const query = q.trim().slice(0, 80);
      const [live, deep] = await Promise.all([photonSearch(query, near), opts?.deep ? nominatimSearch(query, near) : Promise.resolve([])]);
      return rankPlaces([...local, ...live, ...deep], query, near, 8);
    },

    async reverse(p) {
      const [row] = await sql<Row[]>`
        SELECT id, name, place_type, tags->>'mira:kind' AS kind, NULL AS hours, ST_Y(point) AS lat, ST_X(point) AS lon,
               ST_Distance(point::geography, ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography) AS d
        FROM places
        WHERE name IS NOT NULL AND ST_DWithin(point::geography, ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography, 500)
        ORDER BY d LIMIT 1`;
      // MIRA's local map snapshot is the DU North Campus pilot (Delhi).
      const pilot = inBounds(p) ? { country: "IN", region: "IN-DL" } : null;
      if (row?.name) return { label: `Near ${row.name}`, precise: true, ...pilot };
      const area = await osmArea(p);
      return { label: area?.name ?? null, precise: false, country: area?.country ?? pilot?.country ?? null, region: area?.region ?? pilot?.region ?? null };
    },

    async walk(a, b): Promise<WalkRoute> {
      return (await walkRoutes(a, b))[0];
    },

    walkRoutes,

    // Only walking is routed here. There is no open driving or transit router behind MIRA yet,
    // so ride and transit are "not known" (the app asks when she expects to arrive) — never a
    // straight line dressed up as a drive.
    async routes(a, b, mode): Promise<ModeRoute[]> {
      if (mode !== "walk") return [];
      return (await walkRoutes(a, b)).map((r) => ({ ...r, provider: r.approximate ? "estimate" : "osm" }));
    },

    async helpPlaces(points, radiusM, opts) {
      if (!points.length) return [];
      type HelpRow = { id: string; name: string | null; kind: string | null; place_type: string; tags: Record<string, string>; lat: number; lon: number };
      const rows = await sql<HelpRow[]>`
        SELECT id, name, tags->>'mira:kind' AS kind, place_type, tags, ST_Y(point) AS lat, ST_X(point) AS lon
        FROM places
        WHERE place_type = ANY(${["health", "police", "metro", "rail", "pharmacy", "accommodation"]})
          AND ST_DWithin(point::geography,
                (SELECT ST_Collect(ST_SetSRID(ST_MakePoint(x, y), 4326)) FROM unnest(${points.map((p) => p.lon)}::float8[], ${points.map((p) => p.lat)}::float8[]) AS t(x, y))::geography,
                ${radiusM})
        LIMIT 80`;
      const local: HelpPoint[] = [];
      for (const r of rows) {
        const cls = helpClassFromOsm(r.tags);
        if (!cls) continue;
        const hours = r.tags.opening_hours ?? null;
        local.push({ id: r.id, name: displayName(r.name, r.kind ?? HELP_CLASSES[cls].label), cls, lat: r.lat, lon: r.lon, open24h: isOpen24h(hours), hours: isOpen24h(hours) ? null : hours, schedule: parseOpeningHours(hours), source: "osm" });
      }
      // The local snapshot covers one small area; elsewhere ask live OpenStreetMap once for the whole corridor.
      const live = local.length >= 3 ? [] : await overpassHelp(points, radiusM, opts);
      return dedupeHelpPoints([...local, ...live]);
    },

    async nearby(p, radiusM, kinds) {
      const allowed = kinds?.length ? kinds : ["pharmacy", "health", "police", "metro", "bus", "food", "shop", "toilets", "finance"];
      const rows = await sql<Row[]>`
        SELECT id, name, place_type, tags->>'mira:kind' AS kind, tags->>'opening_hours' AS hours, ST_Y(point) AS lat, ST_X(point) AS lon,
               ST_Distance(point::geography, ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography) AS d
        FROM places
        WHERE place_type = ANY(${allowed})
          AND ST_DWithin(point::geography, ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography, ${radiusM})
        ORDER BY d LIMIT 30`;
      const local = rows.map(toHit);
      if (local.length >= 5) return local;
      // One cached 1.5 km lookup; in sparse areas show the closest few even if a bit further out.
      const wide = await overpassNearby(p, 1500, allowed);
      const inside = wide.filter((h) => h.distanceM! <= radiusM);
      const live = inside.length >= 5 ? inside : wide.slice(0, 8);
      return dedupe([...local, ...live]).sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0)).slice(0, 30);
    },
  };
}

/** Same name within ~60 m is the same place (snapshot and live OSM overlap). */
function dedupe(hits: PlaceHit[]): PlaceHit[] {
  const out: PlaceHit[] = [];
  for (const h of hits) if (!out.some((o) => o.name.toLowerCase() === h.name.toLowerCase() && haversineMeters(o, h) < 60)) out.push(h);
  return out;
}

export function distance(a: GeoPoint, b: GeoPoint): number {
  return haversineMeters(a, b);
}
