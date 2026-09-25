import { describe, expect, it } from "vitest";
import { cellsForRoute, routeLighting, samplePolyline, MIN_LIT_VOTERS, LIT_CELL_PRECISION } from "@/domain/lighting";
import { encodeGeohash } from "@/domain/geohash";
import { haversineMeters } from "@/domain/pilot";

// A ~300 m straight street heading east in Delhi.
const route: Array<[number, number]> = [
  [77.2, 28.69],
  [77.2031, 28.69],
];
const cells = cellsForRoute(route);
const walkers = (lit: number, partly: number, dark: number) => cells.map((cell) => ({ cell, lit, partly, dark }));
const empty = { walkers: [], ways: [], poles: [] };

describe("street lighting along a route", () => {
  it("samples every ~15 m and maps the route to small street cells", () => {
    const pts = samplePolyline(route);
    const gaps = pts.slice(1).map((p, i) => haversineMeters(pts[i], p));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(16);
    expect(cells.every((c) => c.length === LIT_CELL_PRECISION)).toBe(true);
    expect(cells.length).toBeGreaterThan(5);
  });

  it("shows walkers' answers only once enough different people agree", () => {
    expect(routeLighting(route, { ...empty, walkers: walkers(MIN_LIT_VOTERS - 1, 0, 0) }).summary.unknown).toBe(100);
    expect(routeLighting(route, { ...empty, walkers: walkers(MIN_LIT_VOTERS, 0, 0) }).summary.lit).toBe(100);
    expect(routeLighting(route, { ...empty, walkers: walkers(0, 0, 4) }).summary.dark).toBe(100);
    expect(routeLighting(route, { ...empty, walkers: walkers(2, 0, 2) }).summary.unknown).toBe(100); // disagreement: say nothing
  });

  it("walkers override OpenStreetMap; OSM tags count within 20 m; poles within 25 m", () => {
    const litWay = { lit: "yes" as const, coords: [[77.2, 28.69001], [77.2031, 28.69001]] as Array<[number, number]> }; // ~1 m away
    const farWay = { lit: "yes" as const, coords: [[77.2, 28.6905], [77.2031, 28.6905]] as Array<[number, number]> }; // ~55 m away
    expect(routeLighting(route, { ...empty, ways: [litWay] }).summary.lit).toBe(100);
    expect(routeLighting(route, { ...empty, ways: [farWay] }).summary.unknown).toBe(100);
    expect(routeLighting(route, { walkers: walkers(0, 0, 3), ways: [litWay], poles: [] }).summary.dark).toBe(100);
    const withPole = routeLighting(route, { ...empty, poles: [{ lat: 28.69, lon: 77.2 }] });
    expect(withPole.summary.poles).toBeGreaterThan(0);
    expect(withPole.summary.poles).toBeLessThan(30); // only the stretch near the pole
    expect(withPole.sources).toEqual({ walkers: false, osm: false, poles: true });
  });

  it("merges runs into continuous segments and summarises to ~100%", () => {
    const half = cells.slice(0, Math.floor(cells.length / 2)).map((cell) => ({ cell, lit: 3, partly: 0, dark: 0 }));
    const out = routeLighting(route, { ...empty, walkers: half });
    expect(out.segments.map((s) => s.status)).toEqual(["lit", "unknown"]);
    expect(out.segments[0].coords.at(-1)).toEqual(out.segments[1].coords[0]); // they touch
    const total = Object.values(out.summary).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
    expect(encodeGeohash(28.69, 77.2, LIT_CELL_PRECISION)).toBe(cells[0]);
  });
});
