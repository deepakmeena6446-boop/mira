import { beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@/server/db/client";
import { importPilot } from "@/server/pilot/importer";
import { PILOT } from "@/domain/pilot";
import { FORBIDDEN_VERDICT_WORDS } from "@/domain/know-copy";
import { GET as pilotGET } from "@/app/api/pilot/route";
import { GET as placesGET } from "@/app/api/places/route";
import { POST as knowPOST } from "@/app/api/know/route";
import { buildGridFixture, FIXTURE_ORIGIN, DLAT, DLON } from "../fixtures/osm-grid";
import { PRIVATE_FIELD_NAMES, allKeys, getRequest, jsonRequest } from "../helpers/http";

const meta = {
  slug: "test-fixture",
  name: "Test fixture grid",
  bounds: PILOT.bounds,
  sourceDate: "2026-01-01T00:00:00Z",
  manifestHash: "test-only",
  sourceUrl: "test-fixture",
  sourceLicence: "ODbL-1.0",
  importerVersion: "test",
};

async function placeId(q: string): Promise<string> {
  const res = await placesGET(getRequest(`/api/places?q=${encodeURIComponent(q)}`));
  const body = await res.json();
  return body.places[0].id;
}

function assertNoVerdicts(json: unknown) {
  const text = JSON.stringify(json);
  for (const re of FORBIDDEN_VERDICT_WORDS) expect(text).not.toMatch(re);
}

describe("KNOW public API (test fixture graph)", () => {
  beforeAll(async () => {
    const sql = getSql();
    await sql`DELETE FROM aggregate_releases`;
    await sql`DELETE FROM pilot_areas`;
    const res = await importPilot(sql, buildGridFixture(), meta, { minLargestComponent: 10 });
    expect(res.ok).toBe(true);
  });

  it("GET /api/pilot returns source, licence and tile config only", async () => {
    const res = await pilotGET();
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.source.licence).toBe("ODbL-1.0");
    expect(body.source.attribution).toContain("OpenStreetMap");
    expect(body.tiles.url).toContain("{z}");
    expect(JSON.stringify(body)).not.toMatch(/SECRET|KEY|postgres:\/\//i);
  });

  it("GET /api/places searches the local index", async () => {
    const res = await placesGET(getRequest("/api/places?q=fixture%20pharm"));
    const body = await res.json();
    expect(body.places[0]).toMatchObject({ name: "Fixture Pharmacy", kind: "Pharmacy" });
    expect(Object.keys(body.places[0]).sort()).toEqual(["id", "kind", "name", "placeType", "point"]);
    const empty = await (await placesGET(getRequest("/api/places?q=x"))).json();
    expect(empty.places).toEqual([]);
  });

  it("place evidence has sourced facts, explicit unknowns and honest empty community data", async () => {
    const id = await placeId("Fixture Pharmacy");
    const res = await knowPOST(jsonRequest("/api/know", { mode: "place", placeId: id, time: "late" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source.name).toBe("OpenStreetMap contributors");
    expect(body.place.facts[0].label).toBe("Mapped pharmacy");
    expect(body.place.facts.find((f: { label: string }) => f.label === "Listed hours").note).toMatch(/outdated/);
    expect(body.community.coverage).toBe("no_recent_community_data");
    expect(body.community.statement).toBe("No recent community observations are available here. This is not a statement about current conditions.");
    expect(body.unknowns.length).toBeGreaterThan(0);
    for (const k of PRIVATE_FIELD_NAMES) expect(allKeys(body).has(k)).toBe(false);
    assertNoVerdicts(body);
  });

  it("missing tags are reported as unknown rather than negative", async () => {
    const id = await placeId("Fixture Metro Gate 1");
    const body = await (await knowPOST(jsonRequest("/api/know", { mode: "place", placeId: id, time: "now" }))).json();
    expect(body.place.facts.some((f: { label: string }) => /hours/i.test(f.label))).toBe(false);
    expect(body.unknowns.join(" ")).toMatch(/No opening hours are mapped/);
  });

  it("route evidence is graph-derived with up to two distinct paths", async () => {
    const from = await placeId("Fixture Pharmacy");
    const to = await placeId("Fixture Metro Gate 1");
    const res = await knowPOST(jsonRequest("/api/know", { mode: "route", origin: { placeId: from }, destination: { placeId: to }, time: "evening" }));
    const body = await res.json();
    expect(body.routes.length).toBeGreaterThanOrEqual(1);
    expect(body.routes.length).toBeLessThanOrEqual(2);
    for (const r of body.routes) {
      expect(r.geometry.length).toBeGreaterThanOrEqual(2);
      expect(r.minutes).toBeGreaterThan(0);
    }
    expect(body.time.band).toBe("evening");
    for (const k of PRIVATE_FIELD_NAMES) expect(allKeys(body).has(k)).toBe(false);
    assertNoVerdicts(body);
  });

  it("returns no route (never a straight line) for disconnected points", async () => {
    const to = await placeId("Fixture Pharmacy");
    const res = await knowPOST(jsonRequest("/api/know", { mode: "route", origin: { lat: 28.7, lon: 77.222 }, destination: { placeId: to }, time: "now" }));
    const body = await res.json();
    expect(body.routes).toBeUndefined();
    expect(body.routeUnavailable.message).toBe("Walking directions aren't available for these points yet.");
    expect(body.origin.point).toBeUndefined(); // user coordinates are never echoed
  });

  it("explains coverage for an outside-pilot origin without a route comparison", async () => {
    const to = await placeId("Fixture Pharmacy");
    const body = await (await knowPOST(jsonRequest("/api/know", { mode: "route", origin: { lat: 28.6139, lon: 77.209 }, destination: { placeId: to } }))).json();
    expect(body.coverage).toBe("outside");
    expect(body.routes).toBeUndefined();
    expect(body.unknowns[0]).toMatch(/does not cover this area yet/);
  });

  it("rejects unknown fields, bad ids and oversized bodies", async () => {
    expect((await knowPOST(jsonRequest("/api/know", { mode: "place", placeId: "nope" }))).status).toBe(400);
    expect((await knowPOST(jsonRequest("/api/know", { mode: "place", placeId: FIXTURE_ORIGIN, extra: 1 }))).status).toBe(400);
    const big = { mode: "place", placeId: "00000000-0000-0000-0000-000000000000", pad: "x".repeat(10_000) };
    expect((await knowPOST(jsonRequest("/api/know", big))).status).toBe(413);
    const missing = await knowPOST(jsonRequest("/api/know", { mode: "place", placeId: "00000000-0000-0000-0000-000000000000" }));
    expect(missing.status).toBe(404);
    void DLAT;
    void DLON;
  });

  it("reports map data as unavailable (503) when no snapshot is loaded", async () => {
    const sql = getSql();
    await sql`DELETE FROM pilot_areas`;
    (globalThis as { __miraGraph?: unknown }).__miraGraph = undefined;
    const res = await knowPOST(jsonRequest("/api/know", { mode: "place", placeId: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(503);
    expect((await placesGET(getRequest("/api/places?q=fixture"))).status).toBe(503);
    await importPilot(sql, buildGridFixture(), meta, { minLargestComponent: 10 });
  });
});
