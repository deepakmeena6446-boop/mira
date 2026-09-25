import { beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@/server/db/client";
import { importPilot } from "@/server/pilot/importer";
import { pilotStatus } from "@/server/pilot/status";
import { recordHeartbeat, workerStatus } from "@/server/health/worker";
import { fixedClock, MINUTE } from "@/server/clock";
import { PILOT } from "@/domain/pilot";
import { buildGridFixture } from "../fixtures/osm-grid";

const meta = {
  slug: "test-fixture",
  name: "Test fixture grid",
  bounds: PILOT.bounds,
  sourceDate: "2026-01-01T00:00:00Z",
  manifestHash: "test-only",
  sourceUrl: "test-fixture",
  sourceLicence: "test-only",
  importerVersion: "test",
};

describe("pilot import into PostGIS (test fixture)", () => {
  beforeAll(async () => {
    const sql = getSql();
    await sql`DELETE FROM pilot_areas`;
  });

  it("reports map data unavailable before any import", async () => {
    expect((await pilotStatus(getSql())).available).toBe(false);
  });

  it("imports, validates and marks the snapshot ready", async () => {
    const sql = getSql();
    const res = await importPilot(sql, buildGridFixture(), meta, { minLargestComponent: 10 });
    expect(res.ok).toBe(true);
    const status = await pilotStatus(sql);
    expect(status.available).toBe(true);
    const [row] = await sql`SELECT count(*)::int AS n FROM walk_nodes WHERE component = 0`;
    expect(row.n).toBe(16);
    const [p] = await sql`SELECT name, ST_Y(point) AS lat FROM places WHERE osm_id = 100`;
    expect(p.name).toBe("Fixture Pharmacy");
  });

  it("leaves the database unchanged when validation fails", async () => {
    const sql = getSql();
    const res = await importPilot(sql, [], meta);
    expect(res.ok).toBe(false);
    expect((await pilotStatus(sql)).available).toBe(true);
  });
});

describe("worker heartbeat readiness", () => {
  it("is healthy with a fresh heartbeat and stale after 3 minutes", async () => {
    const sql = getSql();
    await sql`DELETE FROM worker_heartbeats`;
    const clock = fixedClock("2026-09-24T10:00:00Z");
    expect((await workerStatus(sql, clock)).healthy).toBe(false);
    await recordHeartbeat(sql, "test-worker", clock.now(), "test", clock.now());
    await recordHeartbeat(sql, "job:journeys", clock.now(), "test", clock.now());
    expect((await workerStatus(sql, clock)).healthy).toBe(true);
    // Alive but not completing journeys passes (e.g. failing every time) is not healthy.
    clock.advance(3 * MINUTE + 1000);
    await recordHeartbeat(sql, "test-worker", clock.now(), "test", clock.now());
    expect((await workerStatus(sql, clock)).healthy).toBe(false);
  });
});
