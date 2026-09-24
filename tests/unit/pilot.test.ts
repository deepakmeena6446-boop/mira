import { describe, expect, it } from "vitest";
import { PILOT, allCellIds, cellBounds, cellFor, gridDimensions, haversineMeters, inBounds, parseCellId } from "@/domain/pilot";

describe("pilot bounds", () => {
  it("matches the fixed pilot rectangle", () => {
    expect(PILOT.bounds).toEqual({ south: 28.685, north: 28.705, west: 77.202, east: 77.225 });
  });
  it("accepts inside points and rejects outside or invalid points", () => {
    expect(inBounds({ lat: 28.695, lon: 77.21 })).toBe(true);
    expect(inBounds({ lat: 28.6, lon: 77.21 })).toBe(false);
    expect(inBounds({ lat: Number.NaN, lon: 77.21 })).toBe(false);
  });
});

describe("500 m grid", () => {
  it("covers the pilot with roughly 500 m cells", () => {
    const { rows, cols } = gridDimensions();
    expect(rows).toBe(5);
    expect(cols).toBe(5);
    const b = cellBounds("c0-0")!;
    const h = haversineMeters({ lat: b.south, lon: b.west }, { lat: b.north, lon: b.west });
    const w = haversineMeters({ lat: b.south, lon: b.west }, { lat: b.south, lon: b.east });
    expect(h).toBeGreaterThan(490);
    expect(h).toBeLessThan(510);
    expect(w).toBeGreaterThan(490);
    expect(w).toBeLessThan(510);
  });
  it("maps points to stable cell ids and rejects forged ids", () => {
    expect(cellFor({ lat: 28.6851, lon: 77.2021 })).toBe("c0-0");
    expect(cellFor({ lat: 28.7, lon: 77.3 })).toBeNull();
    expect(parseCellId("c9-9")).toBeNull();
    expect(parseCellId("c1-1; DROP TABLE")).toBeNull();
    expect(allCellIds()).toHaveLength(25);
  });
});
