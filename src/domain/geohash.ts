/**
 * Geohash cells for worldwide, coarse community aggregation. Precision 6 cells are
 * roughly 1.2 km × 0.6 km — coarse enough to never point at a doorstep.
 */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
export const REPORT_CELL_PRECISION = 6;

export function encodeGeohash(lat: number, lon: number, precision = REPORT_CELL_PRECISION): string {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let hash = "";
  let bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { ch = (ch << 1) | 1; lonMin = mid; } else { ch <<= 1; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export function decodeGeohashBounds(hash: string): { south: number; north: number; west: number; east: number } {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let even = true;
  for (const c of hash) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error("invalid geohash");
    for (let b = 4; b >= 0; b--) {
      const on = (v >> b) & 1;
      if (even) {
        const mid = (lonMin + lonMax) / 2;
        if (on) lonMin = mid; else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (on) latMin = mid; else latMax = mid;
      }
      even = !even;
    }
  }
  return { south: latMin, north: latMax, west: lonMin, east: lonMax };
}

export function geohashCenter(hash: string): { lat: number; lon: number } {
  const b = decodeGeohashBounds(hash);
  return { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 };
}

export function isGeohash(s: string, precision = REPORT_CELL_PRECISION): boolean {
  return new RegExp(`^[0-9b-hjkmnp-z]{${precision}}$`).test(s);
}

/** Cells within roughly `radiusM` of a point (centre cell + ring sampled on a grid). */
export function cellsAround(lat: number, lon: number, radiusM = 1500): string[] {
  const cells = new Set<string>();
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) cells.add(encodeGeohash(lat + (i * dLat) / 2, lon + (j * dLon) / 2));
  return [...cells];
}
