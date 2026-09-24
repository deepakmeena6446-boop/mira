import "server-only";
import type postgres from "postgres";
import { getEnv } from "@/server/config/env";
import type { Clock } from "@/server/clock";
import { cellFor, haversineMeters, inBounds, PILOT, type LatLon } from "@/domain/pilot";
import { pathCoords, planRoutes, routeSteps, type RouteGraph } from "@/domain/routing";
import { resolveTimeContext, TIME_BAND_LABEL, type TimeContext } from "@/domain/time-bands";
import {
  lightingFact,
  nearbyFacts,
  placeFacts,
  placeUnknowns,
  ROUTE_UNAVAILABLE_MESSAGE,
  routeUnknowns,
} from "@/domain/know-copy";
import type { Fact, KnowResponse, PilotInfo, RouteResult, SourceInfo } from "@/domain/know-types";
import { formatIstDate } from "@/lib/time";
import { loadGraph } from "./graph";
import { countNearby, getPlace } from "./places";
import { communityFor } from "./community";

export class KnowUnavailableError extends Error {
  constructor() {
    super("Pilot map data is not loaded");
    this.name = "KnowUnavailableError";
  }
}

async function sourceInfo(sql: postgres.Sql): Promise<SourceInfo | null> {
  const [row] = await sql<{ source_date: Date; source_licence: string }[]>`
    SELECT source_date, source_licence FROM pilot_areas WHERE status = 'ready' ORDER BY imported_at DESC LIMIT 1`;
  if (!row) return null;
  return {
    name: "OpenStreetMap contributors",
    licence: row.source_licence,
    attribution: "© OpenStreetMap contributors",
    copyrightUrl: "https://www.openstreetmap.org/copyright",
    snapshotDate: new Date(row.source_date).toISOString(),
  };
}

export async function getPilotInfo(sql: postgres.Sql): Promise<PilotInfo> {
  const env = getEnv();
  const source = await sourceInfo(sql);
  return {
    available: source !== null,
    name: PILOT.name,
    bounds: PILOT.bounds,
    timezone: PILOT.timezone,
    source,
    tiles: {
      url: env.MAP_TILE_URL,
      attribution: env.MAP_TILE_ATTRIBUTION ?? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    },
  };
}

function timeInfo(ctx: TimeContext, clock: Clock): KnowResponse["time"] {
  const { band, fromNow } = resolveTimeContext(ctx, clock.now());
  return { context: ctx, band, label: fromNow ? `Now — ${TIME_BAND_LABEL[band]}` : TIME_BAND_LABEL[band] };
}

async function requireReady(sql: postgres.Sql): Promise<{ source: SourceInfo; graph: RouteGraph }> {
  const [source, graph] = await Promise.all([sourceInfo(sql), loadGraph(sql)]);
  if (!source || !graph) throw new KnowUnavailableError();
  return { source, graph };
}

export async function knowPlace(sql: postgres.Sql, placeId: string, ctx: TimeContext, clock: Clock): Promise<KnowResponse | null> {
  const { source } = await requireReady(sql);
  const place = await getPlace(sql, placeId);
  if (!place) return null;
  const time = timeInfo(ctx, clock);
  const counts = await countNearby(sql, `POINT(${place.point.lon} ${place.point.lat})`, 150, place.id);
  const cell = cellFor(place.point);
  const snapshot = formatIstDate(source.snapshotDate);
  const { tags, ...pub } = place;
  return {
    kind: "place",
    coverage: "inside",
    time,
    source,
    place: { ...pub, facts: placeFacts(place.kind, tags), nearby: nearbyFacts(counts, 150, "this place") },
    community: await communityFor(sql, cell ? [cell] : [], time.band, clock.now()),
    unknowns: placeUnknowns(Boolean(tags.opening_hours), snapshot),
  };
}

export type RouteOrigin = { placeId: string } | { lat: number; lon: number };

/** Cells touched by a polyline, sampling at most every ~40 m so no crossed cell is missed. */
export function cellsAlong(coords: LatLon[]): string[] {
  const cells = new Set<string>();
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i];
    const c = cellFor(a);
    if (c) cells.add(c);
    const b = coords[i + 1];
    if (!b) continue;
    const steps = Math.ceil(haversineMeters(a, b) / 40);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const cc = cellFor({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
      if (cc) cells.add(cc);
    }
  }
  return [...cells].sort();
}

const FOOT_HIGHWAYS = new Set(["footway", "path", "pedestrian", "steps", "corridor"]);

async function routeFacts(sql: postgres.Sql, g: RouteGraph, path: number[], coords: LatLon[], lengthM: number): Promise<{ facts: Fact[]; along: number }> {
  let litYes = 0;
  let litNo = 0;
  let footM = 0;
  let steps = 0;
  for (const id of path) {
    const e = g.edges[id];
    if (e.tags.lit === "yes" || e.tags.lit === "24/7" || e.tags.lit === "automatic") litYes += e.lengthM;
    else if (e.tags.lit === "no") litNo += e.lengthM;
    if (FOOT_HIGHWAYS.has(e.tags.highway ?? "")) footM += e.lengthM;
    if (e.tags.highway === "steps") steps += 1;
  }
  const wkt = `LINESTRING(${coords.map((c) => `${c.lon} ${c.lat}`).join(",")})`;
  const counts = await countNearby(sql, wkt, 40);
  const along = Object.values(counts).reduce((s, n) => s + n, 0);
  const facts: Fact[] = [...nearbyFacts(counts, 40, "this route"), lightingFact(litYes, litNo, lengthM)];
  facts.push({
    label: "Mapped as footpaths",
    value: `${Math.round((footM / Math.max(lengthM, 1)) * 100)}% of the length; the rest follows mapped roads or lanes`,
    note: "Mapped path types, not a description of pavement condition.",
  });
  if (steps > 0) facts.push({ label: "Steps", value: `${steps} mapped section${steps === 1 ? "" : "s"} with steps` });
  return { facts, along };
}

export async function knowRoute(
  sql: postgres.Sql,
  origin: RouteOrigin,
  destinationId: string,
  ctx: TimeContext,
  clock: Clock,
): Promise<KnowResponse | null> {
  const { source, graph } = await requireReady(sql);
  const time = timeInfo(ctx, clock);
  const dest = await getPlace(sql, destinationId);
  if (!dest) return null;
  const { tags: _dt, ...destination } = dest;
  void _dt;
  let originPoint: LatLon;
  let originName: string;
  if ("placeId" in origin) {
    const o = await getPlace(sql, origin.placeId);
    if (!o) return null;
    originPoint = o.point;
    originName = o.name;
  } else {
    originPoint = { lat: origin.lat, lon: origin.lon };
    originName = "Your location (approximate)";
  }
  const snapshot = formatIstDate(source.snapshotDate);

  if (!inBounds(originPoint)) {
    // Outside the pilot: no route comparison, explain coverage (UX spec §4).
    return {
      kind: "route",
      coverage: "outside",
      time,
      source,
      destination,
      community: await communityFor(sql, [], time.band, clock.now()),
      unknowns: ["MIRA does not cover this area yet. Only the Delhi University North Campus pilot area has mapped information."],
    };
  }

  const plan = planRoutes(graph, originPoint, destination.point);
  // Coordinates from "Use my location" are used for this calculation only: never stored or echoed back.
  const originOut = "placeId" in origin ? { name: originName, point: originPoint } : { name: originName };

  if (!plan.ok) {
    const cells = [cellFor(destination.point)].filter((c): c is NonNullable<typeof c> => !!c);
    return {
      kind: "route",
      coverage: "inside",
      time,
      source,
      origin: originOut,
      destination,
      routeUnavailable: { reason: plan.reason!, message: plan.reason === "same_place" ? "These points are at the same place on the walking map." : ROUTE_UNAVAILABLE_MESSAGE },
      community: await communityFor(sql, cells, time.band, clock.now()),
      unknowns: routeUnknowns(snapshot),
    };
  }

  const routes: RouteResult[] = [];
  const alongCounts: number[] = [];
  const allCells = new Set<string>();
  for (const [i, r] of plan.routes.entries()) {
    const coords = pathCoords(graph, r.path);
    cellsAlong(coords).forEach((c) => allCells.add(c));
    const { facts, along } = await routeFacts(sql, graph, r.path, coords, r.lengthM);
    alongCounts.push(along);
    routes.push({
      id: i === 0 ? "A" : "B",
      label: r.label,
      lengthM: Math.round(r.lengthM),
      minutes: r.minutes,
      geometry: coords.map((c) => [Number(c.lon.toFixed(6)), Number(c.lat.toFixed(6))]),
      steps: routeSteps(graph, r.path).map((s) => ({ name: s.name ?? unnamedStep(s.highway), lengthM: Math.round(s.lengthM) })),
      facts,
    });
  }

  const comparison: string[] = [];
  if (routes.length === 2) {
    const [a, b] = routes;
    comparison.push(`The alternate is about ${Math.max(0, b.lengthM - a.lengthM)} m (${Math.max(0, b.minutes - a.minutes)} min) longer by the map.`);
    comparison.push(
      alongCounts[0] === alongCounts[1]
        ? `Both have ${alongCounts[0]} mapped places within 40 m.`
        : `Mapped places within 40 m: shortest ${alongCounts[0]}, alternate ${alongCounts[1]}. More mapped places doesn't mean they are open or staffed now.`,
    );
  } else {
    comparison.push("Only one distinct walking path was found in the map for these points.");
  }

  return {
    kind: "route",
    coverage: "inside",
    time,
    source,
    origin: originOut,
    destination,
    routes,
    comparison,
    community: await communityFor(sql, [...allCells], time.band, clock.now()),
    unknowns: routeUnknowns(snapshot),
  };
}

function unnamedStep(highway: string): string {
  const map: Record<string, string> = {
    footway: "Unnamed footpath",
    path: "Unnamed path",
    steps: "Steps",
    pedestrian: "Pedestrian area",
    corridor: "Indoor corridor",
    service: "Unnamed service lane",
    residential: "Unnamed residential lane",
    living_street: "Unnamed lane",
    cycleway: "Cycle path",
    track: "Unnamed track",
  };
  return map[highway] ?? "Unnamed street";
}
