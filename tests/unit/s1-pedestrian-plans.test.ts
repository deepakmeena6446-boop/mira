import { describe, expect, it } from "vitest";
import { buildRouteGraph, pathCoords, planPedestrianLoops, planRoutes } from "@/domain/routing";
import { GRAPH_MAX_AGE_MS, loopTargetMeters, planOptionsKey, resolvePlanOptions } from "@/domain/plan-options";
import { activatePlanLeg, intentFromDraft, newPlanDraft, parsePlanSession, serializePlanSession } from "@/domain/plan-state";
import { movementIntentSchema } from "@/domain/plan-contract";

// Synthetic directed square plus branch. Geometry is real graph adjacency, never a provider claim.
const points = [{ lat: 28.69, lon: 77.21 }, { lat: 28.69, lon: 77.212 }, { lat: 28.692, lon: 77.212 }, { lat: 28.692, lon: 77.21 }, { lat: 28.69, lon: 77.208 }];
const links = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4]];
const graph = buildRouteGraph(points.map((point, id) => ({ id, ...point, component: 1 })), links.flatMap(([from, to], wayId) => [{ from, to }, { from: to, to: from }].map((edge) => ({ ...edge, lengthM: 200, wayId, coords: [points[edge.from], points[edge.to]], tags: { highway: "footway", name: `Fictional edge ${wayId}` } }))));
const now = new Date("2026-10-03T00:00:00Z");
const plan = movementIntentSchema.parse({ version: 2, activity: "Early run", origin: { kind: "named", query: "Fictional gate", resolution: { source: "search", point: points[0] } }, destination: null, loop: true, departure: { local: "2026-10-07T04:45", timeZone: "Asia/Kolkata" }, mode: "walk", constraints: ["step-free"], loopTarget: { kind: "distance", value: 800 }, paceMinutesPerKm: 6 });
const input = { graph, routes: planPedestrianLoops(graph, points[0], 800), sourceAt: now, checkedAt: now, from: points[0], to: points[0], local: plan.departure.local, timeZone: plan.departure.timeZone, intent: plan };

describe("pedestrian planning completion", () => {
  it("offers a graph-derived cycle closed on its directed starting node and a distinct candidate", () => {
    const result = planPedestrianLoops(graph, points[0], 800);
    expect(result.ok).toBe(true);
    expect(result.routes[0].label).toBe("Loop");
    expect(result.routes[0].lengthM).toBe(800);
    for (const route of result.routes) {
      expect(graph.edges[route.path[0]].from).toBe(0);
      expect(graph.edges[route.path.at(-1)!].to).toBe(0);
      route.path.slice(1).forEach((id, index) => expect(graph.edges[route.path[index]].to).toBe(graph.edges[id].from));
      expect(pathCoords(graph, route.path)[0]).toEqual(points[0]);
      expect(pathCoords(graph, route.path).at(-1)).toEqual(points[0]);
    }
  });
  it("uses an actual directed return for out-and-back and refuses a one-way dead end", () => {
    const line = buildRouteGraph([{ id: 0, ...points[0], component: 1 }, { id: 1, ...points[1], component: 1 }], [{ from: 0, to: 1, lengthM: 400, wayId: 1, coords: [points[0], points[1]], tags: {} }, { from: 1, to: 0, lengthM: 400, wayId: 1, coords: [points[1], points[0]], tags: {} }]);
    expect(planPedestrianLoops(line, points[0], 800).routes[0].label).toBe("Out-and-back");
    const oneWay = { ...line, out: new Map([[0, [0]]]) };
    expect(planPedestrianLoops(oneWay, points[0], 800).routes).toEqual([]);
  });
  it("fails honestly outside the graph or when the requested length is unsupported", () => {
    expect(planPedestrianLoops(graph, { lat: 0, lon: 0 }, 800).reason).toBe("not_near_walkway");
    expect(planPedestrianLoops(graph, points[0], 20_001).reason).toBe("loop_target_unavailable");
    expect(planPedestrianLoops(graph, points[0], 12_000).routes).toEqual([]);
  });
  it("computes run time from editable pace and presents daylight as a separate time alternative", () => {
    const result = resolvePlanOptions(input);
    expect(result.state).toBe("ready");
    expect(result.options[0]).toMatchObject({ kind: "loop", meters: 800, minutes: 5 });
    expect(result.options[0].evidence[0]).toMatchObject({ source: { id: "osm-walking-graph" } });
    expect(result.daylight).toMatchObject({ status: "known", value: "dark" });
    expect(result.timeAlternatives?.[0]).toMatchObject({ local: "2026-10-07T06:30", minutesLater: 105 });
    expect(result.constraints).toEqual([{ text: "step-free", status: "not_checked", reason: "Mira can't check step-free access yet." }]);
    expect(resolvePlanOptions({ ...input, intent: { ...plan, paceMinutesPerKm: 12 } }).options[0].minutes).toBe(10);
    expect(loopTargetMeters({ ...plan, loopTarget: { kind: "duration", value: 30 } })).toBe(5_000);
  });
  it("answers a lighting requirement from the lighting mapped along each way; one plain line for each it can't check", () => {
    const lit = { ...plan, loop: false, destination: { kind: "named" as const, query: "Fictional destination", resolution: { source: "search" as const, point: points[2] } }, constraints: ["well-lit", "step-free", "low cost", "roshni wala rasta", "quiet park"] };
    const result = resolvePlanOptions({ ...input, intent: lit, to: points[2], routes: planRoutes(graph, points[0], points[2]), lighting: [72, null] });
    expect(result.options).toHaveLength(2);
    const [first, second] = result.options.map((o) => o.label);
    expect(result.constraints).toEqual([
      { text: "well-lit", status: "checked", reason: `${first}: 72% mapped as lit or with street lamps; ${second}: lighting not known. Mapped lighting, not whether the lamps work tonight.` },
      { text: "step-free", status: "not_checked", reason: "Mira can't check step-free access yet." },
      { text: "low cost", status: "not_checked", reason: "Mira can't check cost yet." },
      { text: "roshni wala rasta", status: "checked", reason: expect.stringContaining("72% mapped as lit") },
      { text: "quiet park", status: "not_checked", reason: "Mira can't check how busy it is yet." },
    ]);
    expect(JSON.stringify(result.constraints)).not.toMatch(/imported graph does not establish/);
    expect(resolvePlanOptions({ ...input, intent: lit, lighting: [null, null] }).constraints?.[0].reason).toBe("Lighting isn't mapped along these ways, so Mira can't say how lit they are.");
    expect(resolvePlanOptions({ ...input, intent: lit, lighting: "failed" }).constraints?.[0]).toMatchObject({ status: "not_checked", reason: "Mira couldn't check lighting along these ways just now." });
    expect(resolvePlanOptions({ ...input, intent: { ...lit, constraints: ["lit streets", "luggage"] }, routes: null }).constraints).toEqual([
      { text: "lit streets", status: "not_checked", reason: "There's no mapped way yet to check lighting along." },
      { text: "luggage", status: "not_checked", reason: "Mira can't check this yet." },
    ]);
  });
  it("derives each arrive-by departure from that option without treating arrival time as departure", () => {
    const intent = { ...plan, loop: false, destination: { kind: "named" as const, query: "Fictional destination", resolution: { source: "search" as const, point: points[2] } }, timeKind: "arrive_by" as const };
    const result = resolvePlanOptions({ ...input, intent, to: points[2], routes: planRoutes(graph, points[0], points[2]) });
    expect(result.options[0]).toMatchObject({ departureLocal: "2026-10-07T04:42", arrivalLocal: "2026-10-07T04:45", minutes: 3 });
    const ambiguous = resolvePlanOptions({ ...input, local: "2026-10-25T01:30", timeZone: "Europe/London" });
    expect(ambiguous.options).toEqual([]);
    expect(ambiguous.detail).toContain("ambiguous");
  });
  it("never upgrades stale route data or walking evidence into planned ride/transit service", () => {
    expect(resolvePlanOptions({ ...input, sourceAt: new Date(now.getTime() - GRAPH_MAX_AGE_MS - 1) }).options).toEqual([]);
    const intent = { ...plan, loop: false, mode: "transit" as const };
    const result = resolvePlanOptions({ ...input, intent });
    expect(result.manualPlan).toMatchObject({ mode: "transit", serviceEligible: false });
    expect(result.options).toEqual([]);
    expect(result.service).toMatchObject({ status: "unknown", reason: "unsupported" });
    expect(result.manualPlan?.nextSteps.join(" ")).toContain("Confirm operation");
  });
  it("invalidates option identity when constraints, time interpretation, distance or pace change", () => {
    for (const changed of [{ ...plan, constraints: ["no stairs"] }, { ...plan, timeKind: "arrive_by" as const }, { ...plan, paceMinutesPerKm: 8 }, { ...plan, loopTarget: { kind: "distance" as const, value: 1_000 } }]) expect(planOptionsKey(changed)).not.toBe(planOptionsKey(plan));
  });
  it("migrates a version-one tab draft without inventing run pace, target or arrival meaning", () => {
    const draft = { ...newPlanDraft(now, "UTC"), version: 1 as const, timeKind: undefined };
    const migrated = parsePlanSession(JSON.stringify({ savedAt: now.getTime(), draft }), now.getTime())!;
    expect(migrated).toMatchObject({ version: 2, timeKind: "depart_at" });
    expect(migrated.paceMinutesPerKm).toBeUndefined();
    expect(migrated.loopTarget).toBeUndefined();
    expect(parsePlanSession(serializePlanSession(migrated, now.getTime()), now.getTime())).toEqual(migrated);
  });
  it("preserves each leg's arrival semantics and constraints on explicit promotion", () => {
    const place = (query: string, index: number) => ({ query, resolution: { source: "search" as const, name: query, point: points[index] } });
    const draft = { ...newPlanDraft(now, "Asia/Kolkata"), activity: "Arrival", timeKind: "arrive_by" as const, constraints: "step-free", origin: { kind: "named" as const, ...place("Gate", 0) }, destination: place("Venue", 2), legs: [{ label: "Return", origin: place("Venue", 2), destination: place("Gate", 0), departureLocal: "2026-10-03T22:00", timeZone: "Asia/Kolkata", mode: "walk" as const, destinationCountryIso: null, timeKind: "depart_at" as const, constraints: "avoid stairs" }] };
    const promoted = activatePlanLeg(draft, 0)!;
    expect(promoted).toMatchObject({ timeKind: "depart_at", constraints: "avoid stairs" });
    expect(promoted.legs?.[0]).toMatchObject({ timeKind: "arrive_by", constraints: "step-free" });
    expect(intentFromDraft(promoted)?.timeKind).toBe("depart_at");
  });
});
