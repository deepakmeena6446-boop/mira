import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetGoogleBudget } from "@/server/providers/geo/budget";
import { HELP_HOURS_FIELDS, HELP_NEARBY_FIELDS, MAX_HOURS_LOOKUPS, resetGoogleHelpCaches } from "@/server/providers/geo/google";
import { enrichHours, helpPointsForRoutes } from "@/server/help-points";
import { POST as helpPOST } from "@/app/api/geo/help/route";
import { hoursLine, hoursState, rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import type { GeoProvider } from "@/server/providers/geo";
import type { HelpHours } from "@/server/providers/geo/types";
import type { EvidenceState } from "@/domain/evidence-state";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

/**
 * Help Points with Google as the primary source, offline: `fetch` is stubbed. Discovery must
 * never ask for opening hours; only the shortlist shown (≤ 5) gets a Place Details call, cached,
 * and only with GOOGLE_PLACES_HOURS=on. OpenStreetMap stays the fallback.
 */

const LONDON = { lat: 51.5155, lon: -0.1419 };
const DELHI_FIXTURE = { lat: 28.6901, lon: 77.2111 }; // Fixture Pharmacy (test-only grid)
const VERDICTS = /\b(safe|safer|safest|unsafe|dangerous|danger|risky|avoid|staffed)\b/i;

type Call = { url: string; method: string; fields: string | null; body: { includedPrimaryTypes?: string[] } | null };
let calls: Call[] = [];
let failNearby = false;

const at = (dLat: number, dLon = 0) => ({ latitude: LONDON.lat + dLat, longitude: LONDON.lon + dLon });
const PLACES: Record<string, Array<{ id: string; displayName: { text: string }; location: { latitude: number; longitude: number }; primaryType: string }>> = {
  hospital: [
    { id: "hosp1", displayName: { text: "St Example Hospital" }, location: at(0.004), primaryType: "hospital" },
    { id: "braces", displayName: { text: "Maisie braces" }, location: at(0.0005), primaryType: "hospital" }, // not a hospital
  ],
  police: [{ id: "pol1", displayName: { text: "Example Police Station" }, location: at(0.006), primaryType: "police" }],
  subway_station: [{ id: "tube1", displayName: { text: "Oxford Circus" }, location: at(0.001), primaryType: "subway_station" }],
  pharmacy: [
    { id: "ph1", displayName: { text: "Boots Pharmacy" }, location: at(0.0008), primaryType: "pharmacy" },
    { id: "ph2", displayName: { text: "Church Pharmacy" }, location: at(0.0015), primaryType: "pharmacy" },
    { id: "ph3", displayName: { text: "Night Pharmacy" }, location: at(0.002), primaryType: "pharmacy" },
  ],
  hotel: [{ id: "hot1", displayName: { text: "Big Example Hotel" }, location: at(0.003), primaryType: "hotel" }],
  gas_station: [{ id: "gas1", displayName: { text: "Example Fuel" }, location: at(0.005), primaryType: "gas_station" }],
  convenience_store: [{ id: "cs1", displayName: { text: "Corner 24" }, location: at(0.0003), primaryType: "convenience_store" }],
  medical_center: [{ id: "mc1", displayName: { text: "PRP Example Clinic" }, location: at(0.0002), primaryType: "medical_center" }],
};
const WEEK_9_21 = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 21, minute: 0 } }));
const DETAILS: Record<string, object> = {
  hosp1: { id: "hosp1", regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }], weekdayDescriptions: ["Monday: Open 24 hours"] }, currentOpeningHours: { openNow: true } },
  ph1: { id: "ph1", regularOpeningHours: { periods: WEEK_9_21, weekdayDescriptions: ["Monday: 9:00 AM – 9:00 PM"] }, currentOpeningHours: { openNow: true } },
  tube1: { id: "tube1" }, // Google lists no hours: stays "not known"
};

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const headers = new Headers(init?.headers);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  calls.push({ url, method: init?.method ?? "GET", fields: headers.get("x-goog-fieldmask"), body });
  const ok = (v: unknown) => Promise.resolve(new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } }));
  if (url.endsWith("/places:searchNearby")) {
    if (failNearby) return Promise.resolve(new Response("{}", { status: 503 }));
    const types: string[] = body?.includedPrimaryTypes ?? [];
    // Google also returns medical_center for "hospital" (seen live): the classifier must drop it.
    const found = types.flatMap((t) => [...(PLACES[t] ?? []), ...(t === "hospital" ? PLACES.medical_center : [])]);
    return ok({ places: found });
  }
  const m = /\/v1\/places\/([^/?]+)/.exec(url);
  if (m) return ok(DETAILS[decodeURIComponent(m[1])] ?? { id: m[1] });
  return Promise.resolve(new Response("not stubbed", { status: 404 }));
}

const nearbyCalls = () => calls.filter((c) => c.url.endsWith("/places:searchNearby"));
const detailCalls = () => calls.filter((c) => /\/v1\/places\/[^:]+$/.test(c.url.split("?")[0]));

async function help(body: object) {
  const res = await helpPOST(jsonRequest("/api/geo/help", body));
  expect(res.status).toBe(200);
  return (await res.json()) as { helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> };
}

function useEnv(over: Record<string, string | undefined>) {
  applyTestEnv({ GOOGLE_MAPS_SERVER_KEY: "test-only-key", GOOGLE_PLACES_HOURS: "on", OVERPASS_URL: undefined, ...over });
  resetEnvCache();
}

describe("Help Points from Google, hours only for the shortlist", () => {
  beforeAll(async () => {
    useEnv({});
    await loadFixturePilot(getSql());
  });
  beforeEach(async () => {
    calls = [];
    failNearby = false;
    resetGoogleBudget();
    resetGoogleHelpCaches();
    await getSql()`DELETE FROM abuse_counters`;
    switchJar(newJar());
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useEnv({});
  });
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
  });

  it("discovery never asks for hours; ≤ 5 Place Details calls for the shortlist, then cached", async () => {
    const r = await help({ ...LONDON, country: "GB" });
    // Two discovery lookups (main + late classes), no convenience stores outside the countries that turn them on.
    expect(nearbyCalls()).toHaveLength(2);
    for (const c of nearbyCalls()) {
      expect(c.fields).toBe(HELP_NEARBY_FIELDS);
      expect(c.fields).not.toMatch(/OpeningHours|openNow/i);
      expect(c.body?.includedPrimaryTypes).not.toContain("convenience_store");
      expect(c.body?.includedPrimaryTypes).not.toContain("bus_stop");
    }
    expect(nearbyCalls().flatMap((c) => c.body?.includedPrimaryTypes ?? [])).toEqual(expect.arrayContaining(["airport", "international_airport", "hospital", "police", "pharmacy", "gas_station", "bus_station", "lodging"]));
    // Hours: at most five Place Details calls, hours fields only, never with coordinates in the URL.
    expect(detailCalls().length).toBeGreaterThan(0);
    expect(detailCalls().length).toBeLessThanOrEqual(MAX_HOURS_LOOKUPS);
    for (const c of detailCalls()) {
      expect(c.method).toBe("GET");
      expect(c.fields).toBe(HELP_HOURS_FIELDS);
      expect(c.url).not.toMatch(/51\.5|-0\.14/);
    }
    const names = r.helpPoints.map((p) => p.name);
    expect(names).not.toContain("Maisie braces");
    expect(names).not.toContain("PRP Example Clinic");
    expect(names).not.toContain("Corner 24");
    // What came back: 24 h hospital, listed pharmacy hours with Google's own "open now", unknown station hours.
    const byName = new Map(r.helpPoints.map((p) => [p.name, p]));
    expect(byName.get("Boots Pharmacy")).toMatchObject({ source: "google", hoursSource: "google", openNow: true, open24h: false });
    expect(byName.get("Boots Pharmacy")!.schedule).toHaveLength(7);
    expect(typeof byName.get("Boots Pharmacy")!.checkedAt).toBe("number");
    expect(byName.get("Oxford Circus")).toMatchObject({ open24h: false, hours: null });
    expect(byName.get("Oxford Circus")!.schedule ?? null).toBeNull();
    const enriched = r.helpPoints.filter((p) => p.hoursSource);
    expect(enriched.length).toBeLessThanOrEqual(MAX_HOURS_LOOKUPS);
    expect(JSON.stringify(r)).not.toMatch(VERDICTS);

    // The device turns that into honest lines.
    const now = { day: 0, minute: 12 * 60 };
    const ranked = rankHelpPoints(r.helpPoints, LONDON, { situation: "nearby", night: false, now, at: byName.get("Boots Pharmacy")!.checkedAt! + 60_000 });
    const line = (n: string) => hoursLine(ranked.find((p) => p.name === n)!);
    expect(line("Boots Pharmacy")).toBe("Open now, listed until 9 PM · Google");
    expect(line("Oxford Circus")).toBe("Hours not known");
    if (byName.get("St Example Hospital")?.hoursSource) expect(line("St Example Hospital")).toBe("Open 24 hours (listed) · Google");

    // Same place again: everything from the caches, no new Google calls.
    const before = calls.length;
    const again = await help({ ...LONDON, country: "GB" });
    expect(calls.length).toBe(before);
    expect(again.helpPoints.map((p) => p.id)).toEqual(r.helpPoints.map((p) => p.id));
  });

  it("with GOOGLE_PLACES_HOURS off, no Place Details calls at all: every Google place says hours not known", async () => {
    useEnv({ GOOGLE_PLACES_HOURS: "off" });
    const r = await help(LONDON);
    expect(nearbyCalls()).toHaveLength(2);
    expect(detailCalls()).toHaveLength(0);
    expect(r.helpPoints.length).toBeGreaterThan(0);
    for (const p of r.helpPoints) {
      expect(p.schedule ?? null).toBeNull();
      expect(hoursLine({ ...p, hoursNow: hoursState(p, { day: 0, minute: 720 }) })).toBe("Hours not known");
    }
  });

  it("a country that turns convenience stores on gets one more discovery lookup, and them", async () => {
    const r = await help({ ...LONDON, country: "JP" });
    expect(nearbyCalls()).toHaveLength(3);
    expect(nearbyCalls()[2].body?.includedPrimaryTypes).toEqual(["convenience_store"]);
    expect(r.helpPoints.map((p) => p.name)).toContain("Corner 24");
    expect(detailCalls().length).toBeLessThanOrEqual(MAX_HOURS_LOOKUPS);
    expect((await helpPOST(jsonRequest("/api/geo/help", { ...LONDON, country: "Japan" }))).status).toBe(400);
  });

  it("the Google budget bounds hours lookups too: over budget means 'hours not known', never an error", async () => {
    useEnv({ GOOGLE_MAX_CALLS_PER_MIN: "3" });
    const r = await help(LONDON);
    expect(nearbyCalls()).toHaveLength(2);
    expect(detailCalls()).toHaveLength(1);
    expect(r.helpPoints.filter((p) => p.hoursSource)).toHaveLength(1);
    expect(r.helpPoints.length).toBeGreaterThan(1);
  });

  it("falls back to OpenStreetMap (listed hours) when Google fails", async () => {
    failNearby = true;
    const r = await help(DELHI_FIXTURE);
    expect(detailCalls()).toHaveLength(0);
    const pharmacy = r.helpPoints.find((p) => p.name === "Fixture Pharmacy");
    expect(pharmacy).toMatchObject({ source: "osm", hours: "Mo-Sa 09:00-21:00" });
    expect(hoursLine({ ...pharmacy!, hoursNow: hoursState(pharmacy!, { day: 0, minute: 720 }, 1) })).toBe("Listed 9 AM–9 PM · OpenStreetMap");
  });

  it("anywhere without map data: a coherent empty answer, no claims", async () => {
    failNearby = true;
    const r = await help({ lat: -33.8688, lon: 151.2093, country: "AU" }); // Sydney: Google down, no Overpass in tests
    expect(r.helpPoints).toEqual([]);
    expect(r.evidence).toMatchObject({ state: "partial", data: [] });
    expect(r.evidence.sources).toContainEqual({ source: "Google Places", state: "failed", retryable: true });
  });
});

describe("hours for route Help Points: the first few in passing order, ≤ 5 in all", () => {
  const ROUTE_A: Array<[number, number]> = [
    [77.21, 28.69],
    [77.21, 28.695],
    [77.21, 28.7],
  ];
  const ROUTE_B: Array<[number, number]> = [
    [77.21, 28.69],
    [77.2105, 28.695],
    [77.2106, 28.7],
  ];
  const along = (i: number, over: Partial<HelpPoint> = {}): HelpPoint => ({ id: `g:p${i}`, name: `Place ${i}`, cls: "pharmacy", lat: 28.6905 + i * 0.0008, lon: 77.2101, open24h: false, hours: null, source: "google", ...over });

  it("asks for hours only for the shortlist, never for places that already list them", async () => {
    const asked: string[][] = [];
    const points = [...Array.from({ length: 10 }, (_, i) => along(i)), along(20, { id: "osm:node/1", lat: 28.6926, source: "osm", hours: null, open24h: true })];
    const geo = {
      helpPlaces: async () => points,
      helpHours: async (ids: string[]) => {
        asked.push(ids);
        return new Map<string, HelpHours>(ids.map((id) => [id, { schedule: "24/7", text: null }]));
      },
    } as unknown as GeoProvider;
    const [a, b] = await helpPointsForRoutes(geo, [ROUTE_A, ROUTE_B]);
    expect(asked).toHaveLength(1);
    expect(asked[0].length).toBeLessThanOrEqual(5);
    expect(asked[0]).not.toContain("osm:node/1");
    expect(asked[0].slice(0, 2)).toEqual(["g:p0", "g:p1"]); // passing order
    expect(a[0]).toMatchObject({ id: "g:p0", open24h: true, hoursSource: "google" });
    expect(a[0].alongM).toBeDefined();
    expect(a.map((p) => p.id)).toContain("osm:node/1");
    expect(new Set([...a, ...b].filter((p) => p.hoursSource).map((p) => p.id)).size).toBeLessThanOrEqual(5);
    expect(b.find((p) => p.id === "g:p0")).toMatchObject({ open24h: true }); // shared by both options
    // Without a per-place hours lookup (OpenStreetMap-only provider), points come back unchanged.
    const plain = await enrichHours({ helpPlaces: async () => points } as unknown as GeoProvider, points);
    expect(plain).toBe(points);
  });
});
