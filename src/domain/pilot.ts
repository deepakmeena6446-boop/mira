/**
 * Pilot constants and coarse-grid geometry (product spec §2, architecture §2, §5).
 * Pure module: safe for server, worker, tests, and client bundles.
 */

export const PILOT = {
  slug: "du-north-campus",
  name: "Delhi University North Campus · Vishwavidyalaya Metro",
  bounds: { south: 28.685, north: 28.705, west: 77.202, east: 77.225 },
  timezone: "Asia/Kolkata",
} as const;

export type Bounds = { south: number; north: number; west: number; east: number };
export type LatLon = { lat: number; lon: number };

export function inBounds(p: LatLon, b: Bounds = PILOT.bounds): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= b.south &&
    p.lat <= b.north &&
    p.lon >= b.west &&
    p.lon <= b.east
  );
}

const EARTH_RADIUS_M = 6_371_008.8;

export function haversineMeters(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Fixed 500 m grid anchored at the pilot's south-west corner. Cell sizes in
 * degrees are computed once from the pilot's mid latitude so every component
 * (report intake, aggregation, KNOW) agrees on identical cell boundaries.
 */
export const CELL_SIZE_M = 500;
const MID_LAT = (PILOT.bounds.south + PILOT.bounds.north) / 2;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((MID_LAT * Math.PI) / 180);
export const CELL_DLAT = CELL_SIZE_M / M_PER_DEG_LAT;
export const CELL_DLON = CELL_SIZE_M / M_PER_DEG_LON;

export type CellId = `c${number}-${number}`;

export function cellFor(p: LatLon): CellId | null {
  if (!inBounds(p)) return null;
  const row = Math.floor((p.lat - PILOT.bounds.south) / CELL_DLAT);
  const col = Math.floor((p.lon - PILOT.bounds.west) / CELL_DLON);
  return `c${row}-${col}`;
}

export function parseCellId(id: string): { row: number; col: number } | null {
  const m = /^c(\d{1,2})-(\d{1,2})$/.exec(id);
  if (!m) return null;
  const row = Number(m[1]);
  const col = Number(m[2]);
  const { rows, cols } = gridDimensions();
  if (row >= rows || col >= cols) return null;
  return { row, col };
}

export function gridDimensions(): { rows: number; cols: number } {
  return {
    rows: Math.ceil((PILOT.bounds.north - PILOT.bounds.south) / CELL_DLAT),
    cols: Math.ceil((PILOT.bounds.east - PILOT.bounds.west) / CELL_DLON),
  };
}

export function cellBounds(id: string): Bounds | null {
  const rc = parseCellId(id);
  if (!rc) return null;
  const south = PILOT.bounds.south + rc.row * CELL_DLAT;
  const west = PILOT.bounds.west + rc.col * CELL_DLON;
  return {
    south,
    west,
    north: Math.min(PILOT.bounds.north, south + CELL_DLAT),
    east: Math.min(PILOT.bounds.east, west + CELL_DLON),
  };
}

export function allCellIds(): CellId[] {
  const { rows, cols } = gridDimensions();
  const out: CellId[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(`c${r}-${c}`);
  return out;
}
