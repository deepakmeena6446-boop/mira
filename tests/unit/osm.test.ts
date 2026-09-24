import { describe, expect, it } from "vitest";
import { buildPlaces, buildWalkGraph, classifyPlace, connectedComponents, validateImport, walkability } from "@/domain/osm";
import { PILOT } from "@/domain/pilot";
import { buildGridFixture, gridNodeId } from "../fixtures/osm-grid";

const els = buildGridFixture();

describe("classifyPlace", () => {
  it("never labels shop=chemist as a pharmacy", () => {
    expect(classifyPlace({ shop: "chemist" })).toEqual({ placeType: "shop", kindLabel: "Chemist (toiletries) shop" });
    expect(classifyPlace({ amenity: "pharmacy" })?.placeType).toBe("pharmacy");
    expect(classifyPlace({ healthcare: "pharmacy" })?.placeType).toBe("pharmacy");
  });
  it("recognises metro entrances and ignores street furniture", () => {
    expect(classifyPlace({ railway: "subway_entrance" })?.kindLabel).toBe("Metro entrance");
    expect(classifyPlace({ amenity: "bench" })).toBeNull();
    expect(classifyPlace({ highway: "crossing" })).toBeNull();
  });
});

describe("walkability", () => {
  it("respects foot and access restrictions", () => {
    expect(walkability({ highway: "footway", foot: "no" })).toBeNull();
    expect(walkability({ highway: "service", access: "private" })).toBeNull();
    expect(walkability({ highway: "service", access: "private", foot: "yes" })).toBe("both");
    expect(walkability({ highway: "motorway" })).toBeNull();
    expect(walkability({ highway: "construction" })).toBeNull();
  });
  it("applies oneway only to pedestrian ways, oneway:foot everywhere", () => {
    expect(walkability({ highway: "residential", oneway: "yes" })).toBe("both");
    expect(walkability({ highway: "footway", oneway: "yes" })).toBe("forward");
    expect(walkability({ highway: "residential", "oneway:foot": "-1" })).toBe("backward");
  });
});

describe("buildPlaces", () => {
  const places = buildPlaces(els, PILOT.bounds);
  const byId = new Map(places.map((p) => [p.osmId, p]));
  it("keeps sourced places, drops unnamed low-value and out-of-bounds ones", () => {
    expect(byId.get(100)?.name).toBe("Fixture Pharmacy");
    expect(byId.get(100)?.tags.opening_hours).toBe("Mo-Sa 09:00-21:00");
    expect(byId.get(101)?.placeType).toBe("bus"); // unnamed bus stop kept
    expect(byId.has(102)).toBe(false); // bench
    expect(byId.has(104)).toBe(false); // unnamed cafe
    expect(byId.has(105)).toBe(false); // outside pilot
    expect(byId.get(3001)?.osmType).toBe("way");
  });
  it("never invents tags that are absent", () => {
    expect(byId.get(106)?.tags.opening_hours).toBeUndefined();
    expect(byId.get(106)?.tags.wheelchair).toBeUndefined();
  });
});

describe("buildWalkGraph", () => {
  const g = buildWalkGraph(els, PILOT.bounds);
  const has = (a: number, b: number) => g.edges.some((e) => e.from === a && e.to === b);
  it("splits ways at intersections into directed edges", () => {
    expect(has(gridNodeId(0, 0), gridNodeId(0, 1))).toBe(true);
    expect(has(gridNodeId(0, 1), gridNodeId(0, 0))).toBe(true);
    expect(has(gridNodeId(0, 0), gridNodeId(0, 2))).toBe(false);
  });
  it("excludes foot=no and access=private ways", () => {
    expect(has(1, 6)).toBe(false);
    expect(has(5, 9) && g.edges.some((e) => e.wayId === 2005)).toBe(false);
  });
  it("keeps pedestrian one-way direction", () => {
    expect(g.edges.some((e) => e.wayId === 2002 && e.from === 4 && e.to === 7)).toBe(true);
    expect(g.edges.some((e) => e.wayId === 2002 && e.from === 7 && e.to === 4)).toBe(false);
  });
  it("clips ways at the pilot boundary", () => {
    expect(g.nodes.has(62)).toBe(false);
    expect(has(60, 61)).toBe(true);
  });
  it("computes components with the grid as the largest", () => {
    const { componentOf, sizes } = connectedComponents(g);
    expect(componentOf.get(1)).toBe(0);
    expect(componentOf.get(50)).not.toBe(0);
    expect(sizes[0]).toBe(16);
  });
  it("validates a sound import and rejects an empty one", () => {
    const places = buildPlaces(els, PILOT.bounds);
    expect(validateImport(places, g, PILOT.bounds, 10).ok).toBe(true);
    const empty = validateImport([], { nodes: new Map(), edges: [] }, PILOT.bounds);
    expect(empty.ok).toBe(false);
    expect(empty.errors).toContain("no places imported");
  });
});
