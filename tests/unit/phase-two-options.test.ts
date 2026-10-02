import { describe, expect, it } from "vitest";
import { buildRouteGraph, planRoutes } from "@/domain/routing";
import { daylightAt, instantForLocal, resolvePlanOptions, GRAPH_MAX_AGE_MS } from "@/domain/plan-options";

const from = { lat: 28.69, lon: 77.21 };
const to = { lat: 28.691, lon: 77.211 };
const checkedAt = new Date("2026-10-02T04:00:00Z");
const sourceAt = new Date(checkedAt.getTime() - 60_000);
const graph = buildRouteGraph(
  [{ id: 1, ...from, component: 1 }, { id: 2, ...to, component: 1 }],
  [{ from: 1, to: 2, lengthM: 150, wayId: 10, coords: [from, to], tags: { highway: "footway" } }],
);
const request = { graph, routes: planRoutes(graph, from, to), sourceAt, checkedAt, from, to, local: "2026-10-02T09:30", timeZone: "Asia/Kolkata" };

describe("Phase 2 evidence eligibility", () => {
  it("uses graph edges only, labels the route source and leaves service facts unknown", () => {
    const result = resolvePlanOptions(request);
    expect(result.state).toBe("ready");
    expect(result.options).toHaveLength(1);
    expect(result.options[0].geometry).toEqual([[from.lon, from.lat], [to.lon, to.lat]]);
    expect(result.options[0].evidence[0]).toMatchObject({ status: "known", source: { id: "osm-walking-graph", observedAt: sourceAt.toISOString() } });
    expect(result.daylight).toMatchObject({ status: "known", value: "daylight", source: { id: "noaa-solar-equations" } });
    expect(result.service).toMatchObject({ status: "unknown", reason: "unsupported" });
    expect(JSON.stringify(result)).not.toMatch(/safe route|safety score|transit available/i);
  });

  it("distinguishes missing, empty, stale and failed graph checks", () => {
    expect(resolvePlanOptions({ ...request, graph: null, routes: null, sourceAt: null }).state).toBe("missing");
    expect(resolvePlanOptions({ ...request, to: { lat: 0, lon: 0 }, routes: planRoutes(graph, from, { lat: 0, lon: 0 }) }).state).toBe("empty");
    expect(resolvePlanOptions({ ...request, sourceAt: new Date(checkedAt.getTime() - GRAPH_MAX_AGE_MS - 1) }).state).toBe("stale");
    expect(resolvePlanOptions({ ...request, failed: true }).state).toBe("failed");
    expect(resolvePlanOptions({ ...request, sourceAt: new Date(checkedAt.getTime() + 60_000) }).options).toEqual([]);
  });

  it("resolves ordinary local time but refuses both sides of a DST discontinuity", () => {
    expect(instantForLocal("2026-10-02T09:30", "Asia/Kolkata")?.toISOString()).toBe("2026-10-02T04:00:00.000Z");
    expect(instantForLocal("2026-03-29T01:30", "Europe/London")).toBeNull();
    expect(instantForLocal("2026-10-25T01:30", "Europe/London")).toBeNull();
    expect(daylightAt(new Date("2026-10-02T04:00:00Z"), from)).toBe("daylight");
    expect(daylightAt(new Date("2026-10-02T00:00:00Z"), from)).toBe("dark");
  });
});
