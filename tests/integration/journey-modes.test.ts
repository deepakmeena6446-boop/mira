import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetGoogleBudget } from "@/server/providers/geo/budget";
import { POST as routePOST } from "@/app/api/geo/route/route";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const HOME = { lat: 28.6901, lon: 77.2111 }; // Fixture Pharmacy (test-only grid)
const START = { lat: 28.6927, lon: 77.2131 }; // by Fixture Metro Gate 1
const LONDON = { from: { lat: 51.5074, lon: -0.1278 }, to: { lat: 51.5033, lon: -0.1196 } };
const VERDICTS = /\b(safe|safer|safest|unsafe|dangerous|danger|risky|avoid)\b/i;
/** Google's documented example polyline: three points. */
const POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

const route = async (body: unknown) => {
  const res = await routePOST(jsonRequest("/api/geo/route", body));
  return { status: res.status, body: await res.json() };
};

/** Pretend Google is configured, answering Routes with `routes` and Places with nothing. */
function stubGoogle(routes: unknown) {
  process.env.GOOGLE_MAPS_SERVER_KEY = "test-only-key";
  resetEnvCache();
  resetGoogleBudget();
  const calls: Array<{ url: string; fieldMask: string | null; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers = new Headers(init?.headers);
      calls.push({ url, fieldMask: headers.get("x-goog-fieldmask"), body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (url.startsWith("https://routes.googleapis.com/")) return Response.json(routes);
      if (url.startsWith("https://places.googleapis.com/")) return Response.json({ places: [] });
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  return calls;
}

describe("journeys by mode: walk, ride / car, transit", () => {
  beforeAll(async () => {
    await loadFixturePilot(getSql());
    await getSql()`DELETE FROM abuse_counters`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    resetEnvCache();
  });

  it("walk (the default, or explicit) keeps its shape: route, lighting, Help Points along the way, notes, alternatives", async () => {
    switchJar(newJar());
    const implicit = await route({ from: START, to: HOME });
    const explicit = await route({ from: START, to: HOME, mode: "walk" });
    expect(implicit.status).toBe(200);
    expect(Object.keys(implicit.body).sort()).toEqual(["alternatives", "helpEvidence", "helpPoints", "lighting", "lightingEvidence", "notes", "route"]);
    expect(implicit.body.helpEvidence).toHaveProperty("state");
    expect(implicit.body.lightingEvidence).toHaveProperty("state");
    expect(Object.keys(implicit.body.route).sort()).toEqual(["approximate", "geometry", "meters", "minutes"]);
    expect(implicit.body.route.approximate).toBe(false);
    expect(explicit.body).toEqual(implicit.body);
  });

  it.each(["ride", "transit"] as const)("%s without a provider route is 'not known' (no guess, no 500), with Help Points where she arrives", async (mode) => {
    const r = await route({ from: START, to: HOME, mode });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe(mode);
    expect(r.body.route).toBeNull();
    expect(Object.keys(r.body).sort()).toEqual(["arrivalEvidence", "arrivalHelp", "mode", "route"]);
    expect(["ready", "partial"]).toContain(r.body.arrivalEvidence.state); // a completed lookup, distinct from "failed"
    const names = r.body.arrivalHelp.map((p: { name: string }) => p.name);
    expect(names[0]).toBe("Fixture Pharmacy"); // nearest to the destination first
    expect(names).not.toContain("Fixture Toiletries"); // a chemist shop isn't a Help Point
    expect(JSON.stringify(r.body)).not.toMatch(VERDICTS);
  });

  it("the 25 km walking limit doesn't apply to rides, but a journey MIRA can follow still has an end", async () => {
    const far = { from: { lat: 28.6139, lon: 77.209 }, to: { lat: 28.4, lon: 77.05 } }; // ~28 km across a city
    const walk = await route(far);
    expect(walk.status).toBe(400);
    expect(walk.body.error.code).toBe("too_far");
    const ride = await route({ ...far, mode: "ride" });
    expect(ride.status).toBe(200);
    expect(ride.body.route).toBeNull();
    const huge = await route({ from: { lat: -80, lon: -170 }, to: { lat: 80, lon: 170 }, mode: "ride" });
    expect(huge.status).toBe(400);
    expect(huge.body.error.code).toBe("too_far");
  });

  it("rejects modes it doesn't know", async () => {
    for (const mode of ["auto", "metro", "other", "", 3, null]) expect((await route({ ...LONDON, mode })).status).toBe(400);
  });

  it("ride with Google: one DRIVE route on the cheapest routing preference; minutes, metres and line, no lighting", async () => {
    const calls = stubGoogle({ routes: [{ distanceMeters: 1987, duration: "559s", polyline: { encodedPolyline: POLYLINE } }] });
    const r = await route({ ...LONDON, mode: "ride" });
    expect(r.status).toBe(200);
    expect(r.body.route).toEqual({
      meters: 1987,
      minutes: 9,
      geometry: [
        [-120.2, 38.5],
        [-120.95, 40.7],
        [-126.453, 43.252],
      ],
      approximate: false,
      provider: "google",
    });
    expect(r.body).not.toHaveProperty("lighting");
    expect(r.body).not.toHaveProperty("helpPoints");
    expect(r.body.arrivalHelp).toEqual([]);
    const req = calls.find((c) => c.url.includes("routes.googleapis.com"))!;
    expect(req.body).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", computeAlternativeRoutes: false });
    expect(req.fieldMask).toBe("routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline");
  });

  it("transit with Google: no routing preference; no transit route there is 'not known'", async () => {
    const calls = stubGoogle({});
    const r = await route({ ...LONDON, mode: "transit" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mode: "transit", route: null });
    const req = calls.find((c) => c.url.includes("routes.googleapis.com"))!;
    expect(req.body.travelMode).toBe("TRANSIT");
    expect(req.body).not.toHaveProperty("routingPreference");
  });

  it("a failing Google call degrades to 'not known', never an error", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "test-only-key";
    resetEnvCache();
    resetGoogleBudget();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 })),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await route({ ...LONDON, mode: "ride" });
    expect(r.status).toBe(200);
    expect(r.body.route).toBeNull();
    warn.mockRestore();
  });
});
