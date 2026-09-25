import "server-only";
import { osmAreaName } from "./osm-reverse";
import { overpassNearby, photonSearch } from "./osm-live";
import type postgres from "postgres";
import { haversineMeters } from "@/domain/pilot";
import { pathCoords, planRoutes, WALKING_SPEED_KMH } from "@/domain/routing";
import { displayName } from "@/domain/know-copy";
import { loadGraph } from "@/server/know/graph";
import type { GeoPoint, GeoProvider, PlaceHit, WalkRoute } from "./types";

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

  return {
    async search(q, near) {
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
        LIMIT 8`;
      const local = rows.map(toHit).map((h) => (near ? { ...h, distanceM: Math.round(haversineMeters(near, h)) } : h));
      // Local snapshot results that are actually near you win; live OSM fills in everywhere else.
      const close = near ? local.filter((h) => h.distanceM! <= 5000) : local;
      if (close.length >= 3) return local;
      const live = await photonSearch(q.trim().slice(0, 80), near);
      return dedupe([...close, ...live, ...local.filter((h) => !close.includes(h))]).slice(0, 8);
    },

    async reverse(p) {
      const [row] = await sql<Row[]>`
        SELECT id, name, place_type, tags->>'mira:kind' AS kind, NULL AS hours, ST_Y(point) AS lat, ST_X(point) AS lon,
               ST_Distance(point::geography, ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography) AS d
        FROM places
        WHERE name IS NOT NULL AND ST_DWithin(point::geography, ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography, 500)
        ORDER BY d LIMIT 1`;
      if (row?.name) return { label: `Near ${row.name}`, precise: true };
      return { label: await osmAreaName(p), precise: false };
    },

    async walk(a, b): Promise<WalkRoute> {
      const graph = await loadGraph(sql).catch(() => null);
      if (graph) {
        const plan = planRoutes(graph, a, b);
        if (plan.ok && plan.routes[0]) {
          const r = plan.routes[0];
          const coords = pathCoords(graph, r.path);
          return { meters: Math.round(r.lengthM), minutes: r.minutes, geometry: [[a.lon, a.lat], ...coords.map((c) => [c.lon, c.lat] as [number, number]), [b.lon, b.lat]], approximate: false };
        }
      }
      // Straight line with a typical street-network detour factor.
      const meters = Math.round(haversineMeters(a, b) * 1.3);
      return { meters, minutes: Math.max(1, Math.ceil(meters / ((WALKING_SPEED_KMH * 1000) / 60))), geometry: [[a.lon, a.lat], [b.lon, b.lat]], approximate: true };
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
