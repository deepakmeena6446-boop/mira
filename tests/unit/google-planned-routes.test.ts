import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleGeo, googleRouteTimeEligible, GOOGLE_ROUTE_CAPABILITIES } from "@/server/providers/geo/google";
import { resetGoogleBudget } from "@/server/providers/geo/budget";
import type { GeoProvider } from "@/server/providers/geo/types";
const point = { lat: 0, lon: 0 };
const now = new Date("2026-10-03T12:00:00Z");
const departure = { kind: "depart_at" as const, instant: "2026-10-04T01:30:00Z" };
const fallback: GeoProvider = { search: async () => [], reverse: async () => ({ label: null, precise: false }), walk: async () => ({ meters: 1, minutes: 1, geometry: [], approximate: true }), walkRoutes: async () => [], routes: vi.fn(async () => []), nearby: async () => [], helpPlaces: async () => [] };
const geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"; // Google's documented sample; fixture only.
const route = { distanceMeters: 1_800, duration: "600s", polyline: { encodedPolyline: geometry }, legs: [{ steps: [{ distanceMeters: 200, navigationInstruction: { instructions: "Turn left at the fictional junction", maneuver: "TURN_LEFT" } }] }] };

describe("planned Google adapter (all provider responses intercepted)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks(); resetGoogleBudget(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("sends explicit transit departure/arrival, reports source/time and preserves maneuvers without operation assurance", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ routes: [route] })); vi.stubGlobal("fetch", fetch);
    const result = await googleGeo("fictional-key", fallback).routes(point, point, "transit", { plannedTime: departure, includeManeuvers: true });
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ travelMode: "TRANSIT", departureTime: departure.instant });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("arrivalTime");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toContain("navigationInstruction");
    expect(result[0]).toMatchObject({ provider: "google", sourceCheckedAt: now.toISOString(), plannedTime: departure, timeEligible: true, operatingService: "unverified", maneuvers: [{ instruction: "Turn left at the fictional junction", maneuver: "TURN_LEFT", meters: 200 }] });
    await googleGeo("fictional-key", fallback).routes(point, point, "transit", { plannedTime: { ...departure, kind: "arrive_by" } });
    expect(JSON.parse(String((fetch.mock.calls[1][1] as RequestInit).body))).toMatchObject({ arrivalTime: departure.instant });
  });
  it("requests traffic-aware future driving but rejects unsupported arrival and time windows before calling a provider", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ routes: [route] })); vi.stubGlobal("fetch", fetch);
    const provider = googleGeo("fictional-key", fallback);
    await provider.routes(point, point, "ride", { plannedTime: departure });
    expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))).toMatchObject({ routingPreference: "TRAFFIC_AWARE", departureTime: departure.instant });
    expect(await provider.routes(point, point, "ride", { plannedTime: { ...departure, kind: "arrive_by" } })).toEqual([]);
    expect(await provider.routes(point, point, "walk", { plannedTime: departure })).toEqual([]);
    expect(await provider.routes(point, point, "transit", { plannedTime: { ...departure, instant: "2027-10-04T01:30:00Z" } })).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fallback.routes).not.toHaveBeenCalled();
    expect(GOOGLE_ROUTE_CAPABILITIES.transit).toMatchObject({ pastDays: 7, futureDays: 100, mapDisplay: "google", verifiesOperatingService: false });
    expect(googleRouteTimeEligible("transit", { ...departure, instant: "not an instant" }, now.getTime())).toBe(false);
  });
  it("does not relabel fallback computations or current routes as eligible planned evidence", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ routes: [route], fallbackInfo: { routingMode: "FALLBACK_TRAFFIC_UNAWARE" } })); vi.stubGlobal("fetch", fetch);
    expect((await googleGeo("fictional-key", fallback).routes(point, point, "ride", { plannedTime: departure }))[0].timeEligible).toBe(false);
    fetch.mockResolvedValueOnce(new Response("quota", { status: 429 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try { expect(await googleGeo("fictional-key", fallback).routes(point, point, "ride", { plannedTime: departure })).toEqual([]); } finally { warn.mockRestore(); }
    expect(fallback.routes).not.toHaveBeenCalled();
  });
  it("keeps legacy request/result shape and rejects malformed route durations", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ routes: [route] })); vi.stubGlobal("fetch", fetch);
    const result = await googleGeo("fictional-key", fallback).routes(point, point, "ride");
    expect(Object.keys(result[0]).sort()).toEqual(["approximate", "geometry", "meters", "minutes", "provider"]);
    expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))).toMatchObject({ routingPreference: "TRAFFIC_UNAWARE" });
    expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))).not.toHaveProperty("departureTime");
    fetch.mockResolvedValueOnce(Response.json({ routes: [{ ...route, duration: "broken" }] }));
    expect(await googleGeo("fictional-key", fallback).routes(point, point, "transit", { plannedTime: departure })).toEqual([]);
  });
});
