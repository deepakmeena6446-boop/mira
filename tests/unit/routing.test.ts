import { describe, expect, it } from "vitest";
import { buildWalkGraph, connectedComponents } from "@/domain/osm";
import { PILOT } from "@/domain/pilot";
import {
  ALT_MAX_STRETCH,
  ALT_MIN_DISTINCT_SHARE,
  buildRouteGraph,
  distinctShare,
  pathLength,
  planRoutes,
  routeSteps,
  shortestPath,
  walkingMinutes,
  type RouteGraph,
} from "@/domain/routing";
import { FIXTURE_ORIGIN, DLAT, DLON, buildGridFixture, gridNodeId } from "../fixtures/osm-grid";

function fixtureGraph(): RouteGraph {
  const wg = buildWalkGraph(buildGridFixture(), PILOT.bounds);
  const { componentOf } = connectedComponents(wg);
  return buildRouteGraph(
    [...wg.nodes.values()].map((n) => ({ ...n, component: componentOf.get(n.id)! })),
    wg.edges.map((e) => ({ from: e.from, to: e.to, lengthM: e.lengthM, wayId: e.wayId, coords: e.coords, tags: e.tags })),
  );
}

const g = fixtureGraph();
const at = (r: number, c: number) => ({ lat: FIXTURE_ORIGIN.lat + r * DLAT, lon: FIXTURE_ORIGIN.lon + c * DLON });

describe("planRoutes", () => {
  it("returns a graph-derived shortest route with an estimated duration", () => {
    const res = planRoutes(g, at(0, 0), at(3, 3));
    expect(res.ok).toBe(true);
    const r = res.routes[0];
    expect(r.label).toBe("Shortest");
    expect(r.lengthM).toBeGreaterThan(580);
    expect(r.lengthM).toBeLessThan(620);
    expect(r.minutes).toBe(walkingMinutes(r.lengthM));
    expect(r.minutes).toBe(8); // ~600 m at 4.5 km/h
  });

  it("offers a genuinely distinct alternate within 1.5× length", () => {
    const res = planRoutes(g, at(0, 0), at(3, 3));
    expect(res.routes).toHaveLength(2);
    const [a, b] = res.routes;
    expect(b.label).toBe("Alternate");
    expect(b.lengthM).toBeLessThanOrEqual(a.lengthM * ALT_MAX_STRETCH);
    expect(distinctShare(g, a.path, b.path)).toBeGreaterThanOrEqual(ALT_MIN_DISTINCT_SHARE);
    expect(b.path.join()).not.toBe(a.path.join());
  });

  it("returns only one route when no qualifying alternate exists", () => {
    const res = planRoutes(g, at(0, 0), at(0, 1));
    expect(res.ok).toBe(true);
    expect(res.routes).toHaveLength(1);
  });

  it("returns no route between disconnected components", () => {
    const res = planRoutes(g, { lat: 28.7, lon: 77.222 }, at(0, 0));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no_connected_path");
    expect(res.routes).toHaveLength(0);
  });

  it("refuses to snap points farther than 100 m from any walkway", () => {
    const res = planRoutes(g, { lat: 28.7040, lon: 77.2040 }, at(0, 0));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_near_walkway");
  });

  it("recognises identical endpoints", () => {
    expect(planRoutes(g, at(1, 1), at(1, 1)).reason).toBe("same_place");
  });
});

describe("restricted ways", () => {
  it("never routes over foot=no or access=private ways", () => {
    const path = shortestPath(g, 1, 6)!;
    expect(path.every((id) => g.edges[id].wayId !== 2001)).toBe(true);
    const p2 = shortestPath(g, gridNodeId(1, 0), gridNodeId(2, 0))!;
    expect(p2.every((id) => g.edges[id].wayId !== 2005)).toBe(true);
  });

  it("uses a one-way footway only in its permitted direction", () => {
    const fwd = shortestPath(g, 4, 7)!;
    const back = shortestPath(g, 7, 4)!;
    expect(fwd.some((id) => g.edges[id].wayId === 2002)).toBe(true);
    expect(back.some((id) => g.edges[id].wayId === 2002)).toBe(false);
    expect(pathLength(g, fwd)).toBeLessThan(pathLength(g, back));
  });
});

describe("routeSteps", () => {
  it("groups by street name and tolerates missing tags", () => {
    const res = planRoutes(g, at(0, 0), at(0, 3));
    const steps = routeSteps(g, res.routes[0].path);
    expect(steps[0].name).toBe("Fixture Row 0");
    const unnamed = buildRouteGraph(
      [...g.nodes].map(([id, n]) => ({ id, ...n })),
      g.edges.map((e) => ({ ...e, tags: {} })),
    );
    const r2 = planRoutes(unnamed, at(0, 0), at(0, 3));
    const s2 = routeSteps(unnamed, r2.routes[0].path);
    expect(s2[0].name).toBeNull();
    expect(s2[0].highway).toBe("way");
  });
});
