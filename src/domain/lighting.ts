import { encodeGeohash } from "./geohash";
import { haversineMeters } from "./pilot";

/**
 * Street lighting along a walking route, from three layers (strongest first):
 *   1. MIRA walkers' "Was the way lit?" answers — the only source that knows whether a
 *      light *works*; shown only once ≥ 3 different people agree about a spot,
 *   2. OpenStreetMap `lit=yes/no` on the street,
 *   3. streetlight poles detected in street-level photos (Mapillary) — a pole exists,
 *      not necessarily a working light.
 * This is information about lighting, never a safety rating.
 */

export type LightStatus = "lit" | "dark" | "poles" | "unknown";
export type LitVote = "lit" | "partly" | "dark";

/** ~38 m × 19 m cells: small enough for a street stretch, coarse enough to not be a GPS trace. */
export const LIT_CELL_PRECISION = 8;
/** Distinct people who must agree before walkers' answers are shown for a cell. */
export const MIN_LIT_VOTERS = 3;
const SAMPLE_M = 15;

export interface LitWay {
  lit: "yes" | "no";
  coords: Array<[number, number]>; // [lon, lat]
}
export interface WalkerCell {
  cell: string;
  lit: number;
  partly: number;
  dark: number;
}

/** Points every ~15 m along a [lon, lat] polyline (always includes both ends). */
export function samplePolyline(geometry: Array<[number, number]>, stepM = SAMPLE_M): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < geometry.length - 1; i++) {
    const a = { lon: geometry[i][0], lat: geometry[i][1] };
    const b = { lon: geometry[i + 1][0], lat: geometry[i + 1][1] };
    const n = Math.max(1, Math.ceil(haversineMeters(a, b) / stepM));
    for (let s = 0; s < n; s++) out.push({ lat: a.lat + ((b.lat - a.lat) * s) / n, lon: a.lon + ((b.lon - a.lon) * s) / n });
  }
  const last = geometry[geometry.length - 1];
  if (last) out.push({ lon: last[0], lat: last[1] });
  return out;
}

/** The lighting cells a route passes through (what a "Was it lit?" answer is about). */
export function cellsForRoute(geometry: Array<[number, number]>): string[] {
  return [...new Set(samplePolyline(geometry).map((p) => encodeGeohash(p.lat, p.lon, LIT_CELL_PRECISION)))];
}

/** Metres from a point to a [lon, lat] segment (equirectangular; fine at street scale). */
function distToSegmentM(p: { lat: number; lon: number }, a: [number, number], b: [number, number]): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  const ax = (a[0] - p.lon) * k;
  const ay = (a[1] - p.lat) * 111_320;
  const bx = (b[0] - p.lon) * k;
  const by = (b[1] - p.lat) * 111_320;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function walkerVerdict(c: WalkerCell | undefined): "lit" | "dark" | null {
  if (!c) return null;
  const voters = c.lit + c.partly + c.dark;
  if (voters < MIN_LIT_VOTERS) return null;
  if (c.lit / voters >= 0.6) return "lit";
  if (c.dark / voters >= 0.6) return "dark";
  return null; // people disagree: say nothing rather than guess
}

export interface LightingSegment {
  status: LightStatus;
  coords: Array<[number, number]>;
}
export interface RouteLighting {
  segments: LightingSegment[];
  /** Share of the route (0–100, rounded) in each status. */
  summary: Record<LightStatus, number>;
  sources: { walkers: boolean; osm: boolean; poles: boolean };
}

export function routeLighting(geometry: Array<[number, number]>, layers: { walkers: WalkerCell[]; ways: LitWay[]; poles: Array<{ lat: number; lon: number }> }): RouteLighting {
  const samples = samplePolyline(geometry);
  const byCell = new Map(layers.walkers.map((c) => [c.cell, c]));
  const used = { walkers: false, osm: false, poles: false };
  const statuses: LightStatus[] = samples.map((p) => {
    const w = walkerVerdict(byCell.get(encodeGeohash(p.lat, p.lon, LIT_CELL_PRECISION)));
    if (w) return (used.walkers = true), w;
    for (const way of layers.ways) {
      for (let i = 0; i < way.coords.length - 1; i++) {
        if (distToSegmentM(p, way.coords[i], way.coords[i + 1]) <= 20) return (used.osm = true), way.lit === "yes" ? "lit" : "dark";
      }
    }
    if (layers.poles.some((l) => haversineMeters(p, l) <= 25)) return (used.poles = true), "poles";
    return "unknown";
  });

  // Merge runs of the same status into drawable segments (sharing the boundary point).
  const segments: LightingSegment[] = [];
  samples.forEach((p, i) => {
    const s = statuses[i];
    const last = segments[segments.length - 1];
    if (last && last.status === s) last.coords.push([p.lon, p.lat]);
    else {
      const prev = last?.coords[last.coords.length - 1];
      segments.push({ status: s, coords: prev ? [prev, [p.lon, p.lat]] : [[p.lon, p.lat]] });
    }
  });

  const count = (s: LightStatus) => statuses.filter((x) => x === s).length;
  const total = Math.max(1, statuses.length);
  const summary = { lit: 0, dark: 0, poles: 0, unknown: 0 } as Record<LightStatus, number>;
  for (const s of ["lit", "dark", "poles", "unknown"] as LightStatus[]) summary[s] = Math.round((count(s) / total) * 100);
  return { segments: segments.filter((s) => s.coords.length > 1), summary, sources: used };
}
