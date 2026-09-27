import "server-only";
import type postgres from "postgres";
import { cellsForRoute, routeLighting, type LitVote, type LitWay, type Pole, type RouteLighting, type WalkerCell } from "@/domain/lighting";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { hmacHex } from "@/server/crypto";
import { getEnv } from "@/server/config/env";
import { evidenceState, type EvidenceState, type SourceState } from "@/domain/evidence-state";
import { overpassSlot } from "@/server/providers/geo/overpass-slot";
import { errCode } from "@/server/log/err-code";

/**
 * Street lighting along routes (see src/domain/lighting.ts for the layers and rules).
 * External layers (OpenStreetMap via Overpass, Mapillary) are fetched per small bounding
 * box from our server, cached, and time-boxed: a slow or failing layer just contributes
 * nothing. Walkers' answers never identify a person or a route (migration 0010).
 */

const LAYER_TIMEOUT_MS = 4000;
const WALKER_WINDOW_DAYS = 90; // lights get fixed (or break): older answers stop counting
const UA = () => `MIRA/0.1 (street lighting; ${getEnv().APP_BASE_URL})`;

type Box = { s: number; w: number; n: number; e: number };
function bboxOf(geometry: Array<[number, number]>, padDeg = 0.0005): Box {
  const lons = geometry.map((c) => c[0]);
  const lats = geometry.map((c) => c[1]);
  // Rounded outward to ~500 m so nearby routes share a cache entry.
  const r = (v: number, f: (x: number) => number) => f(v / 0.005) * 0.005;
  return { s: r(Math.min(...lats) - padDeg, Math.floor), w: r(Math.min(...lons) - padDeg, Math.floor), n: r(Math.max(...lats) + padDeg, Math.ceil), e: r(Math.max(...lons) + padDeg, Math.ceil) };
}
const boxKey = (b: Box) => `${b.s.toFixed(3)},${b.w.toFixed(3)},${b.n.toFixed(3)},${b.e.toFixed(3)}`;

function ttlCache<T>(max: number, ttlMs: number) {
  const m = new Map<string, { at: number; v: T }>();
  return {
    get: (k: string) => {
      const e = m.get(k);
      return e && Date.now() - e.at < ttlMs ? e.v : undefined;
    },
    set: (k: string, v: T) => {
      if (m.size >= max) m.delete(m.keys().next().value!);
      m.set(k, { at: Date.now(), v });
    },
  };
}
const waysCache = ttlCache<LitWay[]>(300, 6 * 3600_000);

/** Streets tagged lit=yes/no in OpenStreetMap inside the box. */
async function osmLitWays(b: Box): Promise<LitWay[]> {
  const base = getEnv().OVERPASS_URL;
  if (!base) return [];
  const key = boxKey(b);
  const hit = waysCache.get(key);
  if (hit) return hit;
  await overpassSlot(); // polite rate, shared with Help Points; past a short wait this source reports "failed"
  // `meta` adds each way's last-edit timestamp: old map data is shown as old.
  const query = `[out:json][timeout:8];way[highway][lit~"^(yes|no)$"](${b.s},${b.w},${b.n},${b.e});out tags geom meta 400;`;
  const res = await fetch(base, {
    method: "POST",
    headers: { "user-agent": UA(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(LAYER_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("lighting_osm_http");
  type El = { tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }>; timestamp?: string };
  const ways = (((await res.json()) as { elements?: El[] }).elements ?? [])
    .filter((e) => e.geometry?.length && (e.tags?.lit === "yes" || e.tags?.lit === "no"))
    .map((e) => {
      const year = e.timestamp ? new Date(e.timestamp).getUTCFullYear() : NaN;
      return { lit: e.tags!.lit as "yes" | "no", coords: e.geometry!.map((g) => [g.lon, g.lat] as [number, number]), ...(Number.isFinite(year) ? { editedYear: year } : {}) };
    });
  waysCache.set(key, ways);
  return ways;
}

/**
 * Streetlight poles detected in Mapillary street-level imagery inside the box (needs
 * MAPILLARY_TOKEN). Read from Mapillary's map-feature vector tiles at zoom 14 (~2.4 km):
 * their search endpoint returns nothing for many areas, the tiles are what mapillary.com uses.
 */
const TILE_Z = 14;
const tileCache = ttlCache<Pole[]>(200, 24 * 3600_000);
const tileXY = (lat: number, lon: number) => {
  const n = 2 ** TILE_Z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)] as const;
};

async function mapillaryTile(token: string, x: number, y: number): Promise<Pole[]> {
  const key = `${x}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const res = await fetch(`https://tiles.mapillary.com/maps/vtp/mly_map_feature_point/2/${TILE_Z}/${x}/${y}?access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(LAYER_TIMEOUT_MS) });
  if (!res.ok) throw new Error("lighting_mapillary_http");
  const vt = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
  const layer = vt.layers.point;
  const lights: Pole[] = [];
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.properties.value !== "object--street-light") continue;
    const g = f.toGeoJSON(x, y, TILE_Z).geometry;
    // last_seen_at (ms): when street imagery last showed this pole. A pole is not a working light either way.
    const seen = Number(f.properties.last_seen_at);
    const seenYear = Number.isFinite(seen) && seen > 0 ? new Date(seen).getUTCFullYear() : undefined;
    if (g.type === "Point") lights.push({ lon: g.coordinates[0], lat: g.coordinates[1], ...(seenYear ? { seenYear } : {}) });
  }
  tileCache.set(key, lights);
  return lights;
}

async function mapillaryPoles(b: Box): Promise<Pole[]> {
  const token = getEnv().MAPILLARY_TOKEN;
  if (!token) return [];
  const [x0, y0] = tileXY(b.n, b.w);
  const [x1, y1] = tileXY(b.s, b.e);
  const tiles: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
  if (tiles.length > 6) return []; // a walking route never needs more; don't fan out on odd input
  const all = (await Promise.all(tiles.map(([x, y]) => mapillaryTile(token, x, y)))).flat();
  return all.filter((p) => p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e);
}

async function walkerCells(sql: postgres.Sql, cells: string[], now: Date): Promise<WalkerCell[]> {
  if (!cells.length) return [];
  return sql<WalkerCell[]>`
    SELECT cell, count(*) FILTER (WHERE value = 1)::int AS lit, count(*) FILTER (WHERE value = 0)::int AS partly, count(*) FILTER (WHERE value = -1)::int AS dark
    FROM lit_votes WHERE cell = ANY(${cells}) AND identity_version = 2 AND day > ${new Date(now.getTime() - WALKER_WINDOW_DAYS * 86_400_000)}
    GROUP BY cell`;
}

async function source<T>(name: string, request: () => Promise<T>, empty: T, configured = true): Promise<{ data: T; status: SourceState }> {
  if (!configured) return { data: empty, status: { source: name, state: "unavailable" } };
  try { return { data: await request(), status: { source: name, state: "ready" } }; }
  catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "lighting.layer_failed", layer: name, error: errCode(err) }));
    return { data: empty, status: { source: name, state: "failed", retryable: true } };
  }
}

/** Detailed source state is returned alongside the coverage for each route. */
export async function lightingEvidenceForRoutes(sql: postgres.Sql, geometries: Array<Array<[number, number]>>, now = new Date()): Promise<Array<EvidenceState<RouteLighting>>> {
  const real = geometries.filter((g) => g.length >= 3);
  if (!real.length) return geometries.map(() => ({ state: "unavailable", sources: [], retryable: false }));
  const b = bboxOf(real.flat());
  const env = getEnv();
  const [walkers, ways, poles] = await Promise.all([
    source("MIRA walkers", () => walkerCells(sql, [...new Set(real.flatMap((g) => cellsForRoute(g)))], now), []),
    source("OpenStreetMap", () => osmLitWays(b), [], Boolean(env.OVERPASS_URL)),
    source("Mapillary", () => mapillaryPoles(b), [], Boolean(env.MAPILLARY_TOKEN)),
  ]);
  const sources = [walkers.status, ways.status, poles.status];
  return geometries.map((g) => {
    if (g.length < 3) return { state: "unavailable", sources: [], retryable: false };
    const data = routeLighting(g, { walkers: walkers.data, ways: ways.data, poles: poles.data });
    const hasEvidence = data.summary.lit + data.summary.poles + data.summary.dark > 0;
    return evidenceState(data, hasEvidence, sources);
  });
}

/** Compatibility for callers that need coverage alone. */
export async function lightingForRoutes(sql: postgres.Sql, geometries: Array<Array<[number, number]>>, now = new Date()): Promise<Array<RouteLighting | null>> {
  return (await lightingEvidenceForRoutes(sql, geometries, now)).map((r) => "data" in r ? r.data : null);
}

export async function lightingForRoute(sql: postgres.Sql, geometry: Array<[number, number]>, now = new Date()): Promise<RouteLighting | null> {
  return (await lightingForRoutes(sql, [geometry], now))[0];
}

const VALUE: Record<LitVote, number> = { lit: 1, partly: 0, dark: -1 };
/** ISO week label ("2026-39"): the rotation period of lighting voter hashes. */
export const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t.getTime() - start.getTime()) / 86_400_000 + 1) / 7)}`;
};

/**
 * Record "Was the way lit?" for the route just walked. The route is turned into cells and
 * discarded; each cell's row carries only a per-cell keyed hash (so one person counts
 * once per cell per week) and the day — nothing joins the cells back into a path.
 */
/** A person's keyed, per-stretch voice in lit_votes (see recordLitVote). */
export const litVoterHash = (userId: string, cell: string) => hmacHex("lit-vote", `${userId}:${cell}`);

export async function recordLitVote(sql: postgres.Sql, userId: string, geometry: Array<[number, number]>, vote: LitVote, now = new Date()): Promise<number> {
  const cells = cellsForRoute(geometry).slice(0, 400);
  const day = now.toISOString().slice(0, 10);
  // One voice per person per street stretch, whenever she answers: a newer answer replaces her
  // older one (so walking the same street in three different weeks can't make it "agreed").
  // The key still differs per stretch, so her stretches can't be joined into a route.
  for (const cell of cells) {
    await sql`
      INSERT INTO lit_votes (cell, value, voter_hash, day, identity_version) VALUES (${cell}, ${VALUE[vote]}, ${litVoterHash(userId, cell)}, ${day}, 2)
      ON CONFLICT (cell, voter_hash) DO UPDATE SET value = EXCLUDED.value, day = EXCLUDED.day, identity_version = 2`;
  }
  return cells.length;
}

export async function purgeOldLitVotes(sql: postgres.Sql, now: Date): Promise<number> {
  return (await sql`DELETE FROM lit_votes WHERE day < ${new Date(now.getTime() - 120 * 86_400_000)}`).count;
}
