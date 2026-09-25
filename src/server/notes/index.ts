import "server-only";
import type postgres from "postgres";
import { cellsAround, encodeGeohash, geohashCenter } from "@/domain/geohash";
import type { GeoPoint } from "@/server/providers/geo";

/** A released, thresholded community summary shown softly on the map. */
export interface CommunityNote {
  id: string;
  text: string;
  polarity: "positive" | "environmental" | "incident";
  timeBand: string;
  lat: number;
  lon: number;
  week: string;
}

/** Only `aggregate_releases` ever feeds public notes (no raw reports, no counts). */
export async function notesForCells(sql: postgres.Sql, cells: string[]): Promise<CommunityNote[]> {
  if (!cells.length) return [];
  const rows = await sql<{ id: string; copy: string; polarity: CommunityNote["polarity"]; time_band: string; cell_id: string; release_week: Date }[]>`
    SELECT id, copy, polarity, time_band, cell_id, release_week FROM aggregate_releases
    WHERE cell_id = ANY(${cells}) AND suppressed_at IS NULL AND expires_at > now()
    ORDER BY release_week DESC LIMIT 20`;
  return rows.map((r) => {
    const c = /^[0-9b-hjkmnp-z]{6}$/.test(r.cell_id) ? geohashCenter(r.cell_id) : { lat: 0, lon: 0 };
    return { id: r.id, text: r.copy, polarity: r.polarity, timeBand: r.time_band, lat: c.lat, lon: c.lon, week: new Date(r.release_week).toISOString().slice(0, 10) };
  }).filter((n) => n.lat !== 0 || n.lon !== 0);
}

export function notesNear(sql: postgres.Sql, p: GeoPoint, radiusM = 1500) {
  return notesForCells(sql, cellsAround(p.lat, p.lon, radiusM));
}

/** Cells touched by a route polyline ([lon, lat] pairs), sampled every ~300 m, capped at 200. */
export const MAX_ROUTE_CELLS = 200;
export function cellsAlongRoute(geometry: Array<[number, number]>): string[] {
  const out = new Set<string>();
  for (let i = 0; i < geometry.length; i++) {
    const [lon, lat] = geometry[i];
    out.add(encodeGeohash(lat, lon));
    const next = geometry[i + 1];
    if (!next) continue;
    const steps = Math.ceil((Math.hypot(next[0] - lon, next[1] - lat) * 111_000) / 300);
    for (let s = 1; s < steps && out.size < MAX_ROUTE_CELLS; s++) out.add(encodeGeohash(lat + ((next[1] - lat) * s) / steps, lon + ((next[0] - lon) * s) / steps));
    if (out.size >= MAX_ROUTE_CELLS) break;
  }
  return [...out].slice(0, MAX_ROUTE_CELLS);
}
