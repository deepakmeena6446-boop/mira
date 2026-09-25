import { describe, expect, it } from "vitest";
import { cellsAround, decodeGeohashBounds, encodeGeohash, geohashCenter, isGeohash } from "@/domain/geohash";

describe("geohash", () => {
  it("encodes known points", () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
    expect(encodeGeohash(28.6954, 77.2145)).toMatch(/^tt[a-z0-9]{4}$/);
  });
  it("round-trips within the cell bounds", () => {
    const h = encodeGeohash(-33.8688, 151.2093);
    const b = decodeGeohashBounds(h);
    expect(-33.8688).toBeGreaterThanOrEqual(b.south);
    expect(-33.8688).toBeLessThanOrEqual(b.north);
    expect(151.2093).toBeGreaterThanOrEqual(b.west);
    expect(isGeohash(h)).toBe(true);
    expect(Math.abs(geohashCenter(h).lat + 33.8688)).toBeLessThan(0.01);
  });
  it("works worldwide and finds neighbouring cells", () => {
    for (const [la, lo] of [[40.7128, -74.006], [51.5074, -0.1278], [-1.2921, 36.8219], [35.6762, 139.6503]]) {
      expect(isGeohash(encodeGeohash(la, lo))).toBe(true);
    }
    const around = cellsAround(28.6954, 77.2145, 1500);
    expect(around.length).toBeGreaterThan(1);
    expect(around).toContain(encodeGeohash(28.6954, 77.2145));
  });
});
