import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getSql } from "@/server/db/client";
import { runWeeklyAggregation, recheckReleasesForReport, suppressRelease } from "@/server/aggregate/run";
import { fixedClock } from "@/server/clock";
import { cellFor } from "@/domain/pilot";
import { POST as knowPOST } from "@/app/api/know/route";
import { loadFixturePilot, fixturePlaceId } from "../helpers/pilot";
import { jsonRequest, allKeys, PRIVATE_FIELD_NAMES } from "../helpers/http";

/**
 * TEST-ONLY synthetic observations inserted straight into the test database. They
 * never exist in the application database.
 */
const MONDAY = new Date("2026-09-28T03:00:00Z");
const DAY = 86_400_000;
let placeId = "";
let cell = "";

async function approved(actor: string, over: { band?: string; category?: string; tags?: string[]; daysAgo?: number; group?: string } = {}) {
  const sql = getSql();
  const created = new Date(MONDAY.getTime() - (over.daysAgo ?? 3) * DAY - Math.floor(Math.random() * 20) * 3600_000);
  const [r] = await sql`
    INSERT INTO reports_private (actor_hash, idempotency_key, involvement, category, coarse_cell_id, recency_bucket, time_band, status, created_at, expires_at)
    VALUES (${actor}, ${randomUUID()}, 'witnessed', ${over.category ?? "environment"}, ${cell}, 'past_week', ${over.band ?? "late"}, 'approved', ${created}, ${new Date(created.getTime() + 30 * DAY)})
    RETURNING id`;
  await sql`INSERT INTO report_structured (report_id, category, tags, cell_id, time_band, recency_bucket, approved_at, duplicate_group)
            VALUES (${r.id}, ${over.category ?? "environment"}, ${over.tags ?? ["poor_lighting"]}, ${cell}, ${over.band ?? "late"}, 'past_week', ${created}, ${over.group ?? r.id})`;
  return r.id as string;
}

async function know(time: "now" | "evening" | "late" = "late") {
  return (await knowPOST(jsonRequest("/api/know", { mode: "place", placeId, time }))).json();
}

describe("community release end to end (synthetic test fixtures)", () => {
  beforeAll(async () => {
    const sql = getSql();
    await loadFixturePilot(sql);
    placeId = await fixturePlaceId(sql, "Fixture Pharmacy");
    const [p] = await sql<{ lat: number; lon: number }[]>`SELECT ST_Y(point) AS lat, ST_X(point) AS lon FROM places WHERE id = ${placeId}`;
    cell = cellFor(p)!;
  });
  beforeEach(async () => {
    const sql = getSql();
    await sql`DELETE FROM aggregate_releases`;
    await sql`DELETE FROM aggregate_runs`;
    await sql`DELETE FROM reports_private`;
  });

  it("releases nothing for 1 or 4 contributors", async () => {
    await approved("a0");
    expect((await runWeeklyAggregation(getSql(), fixedClock(MONDAY))).releasesCreated).toBe(0);
    await getSql()`DELETE FROM aggregate_runs`;
    for (const a of ["a1", "a2", "a3"]) await approved(a);
    expect((await runWeeklyAggregation(getSql(), fixedClock(MONDAY))).releasesCreated).toBe(0);
    expect((await know()).community.coverage).toBe("no_recent_community_data");
  });

  it("releases one coarse summary at five independent contributors, visible in KNOW without private data", async () => {
    for (let i = 0; i < 5; i++) await approved(`actor-${i}`);
    const run = await runWeeklyAggregation(getSql(), fixedClock(MONDAY));
    expect(run).toMatchObject({ ran: true, releasesCreated: 1, releaseWeek: "2026-09-28" });
    const body = await know("late");
    expect(body.community.coverage).toBe("multiple_independent_recent_observations");
    expect(body.community.matching).toHaveLength(1);
    expect(body.community.matching[0].text).toBe("Multiple reviewed observations mention poor lighting in this area during late hours.");
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/actor-\d|\b5 (reports|people|observations)\b/);
    for (const k of PRIVATE_FIELD_NAMES) expect(allKeys(body).has(k)).toBe(false);
    // Day-time view lists it only under other times of day.
    const dayView = await know("now");
    if (dayView.community.selectedBand !== "late") {
      expect(dayView.community.matching).toHaveLength(0);
      expect(dayView.community.otherBands).toHaveLength(1);
    }
  });

  it("does not count five repeats from one browser", async () => {
    for (let i = 0; i < 5; i++) await approved("same-actor");
    expect((await runWeeklyAggregation(getSql(), fixedClock(MONDAY))).releasesCreated).toBe(0);
  });

  it("keeps day and late separate", async () => {
    for (let i = 0; i < 3; i++) await approved(`l${i}`, { band: "late" });
    for (let i = 0; i < 2; i++) await approved(`d${i}`, { band: "day" });
    expect((await runWeeklyAggregation(getSql(), fixedClock(MONDAY))).releasesCreated).toBe(0);
  });

  it("runs only on Mondays and at most once per week", async () => {
    for (let i = 0; i < 5; i++) await approved(`w${i}`);
    expect((await runWeeklyAggregation(getSql(), fixedClock("2026-09-29T03:00:00Z"))).ran).toBe(false);
    expect((await runWeeklyAggregation(getSql(), fixedClock(MONDAY))).ran).toBe(true);
    expect((await runWeeklyAggregation(getSql(), fixedClock(new Date(MONDAY.getTime() + 3600_000)))).ran).toBe(false);
  });

  it("a tiny weekly increment does not reveal a new release", async () => {
    for (let i = 0; i < 5; i++) await approved(`base${i}`, { daysAgo: 2 });
    await runWeeklyAggregation(getSql(), fixedClock(MONDAY));
    const first = await know("late");
    const next = new Date(MONDAY.getTime() + 7 * DAY);
    const sql = getSql();
    const created = new Date(next.getTime() - 2 * DAY);
    const [r] = await sql`INSERT INTO reports_private (actor_hash, idempotency_key, involvement, category, coarse_cell_id, recency_bucket, time_band, status, created_at, expires_at)
      VALUES ('newcomer', ${randomUUID()}, 'witnessed', 'environment', ${cell}, 'today', 'late', 'approved', ${created}, ${new Date(created.getTime() + 30 * DAY)}) RETURNING id`;
    await sql`INSERT INTO report_structured (report_id, category, tags, cell_id, time_band, recency_bucket, approved_at) VALUES (${r.id}, 'environment', ${["poor_lighting"]}, ${cell}, 'late', 'today', ${created})`;
    const run2 = await runWeeklyAggregation(sql, fixedClock(next));
    expect(run2.releasesCreated).toBe(0);
    const second = await know("late");
    expect(second.community.matching.map((o: { id: string }) => o.id)).toEqual(first.community.matching.map((o: { id: string }) => o.id));
  });

  it("withdrawal suppresses a release that falls below five, and future runs exclude it", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await approved(`v${i}`));
    await runWeeklyAggregation(getSql(), fixedClock(MONDAY));
    await getSql()`UPDATE report_structured SET withdrawn_at = now() WHERE report_id = ${ids[0]}`;
    const suppressed = await recheckReleasesForReport(getSql(), ids[0], new Date());
    expect(suppressed).toHaveLength(1);
    expect((await know("late")).community.coverage).toBe("no_recent_community_data");
  });

  it("retention-expired contributors still count when another report is withdrawn", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await approved(`x${i}`));
    await runWeeklyAggregation(getSql(), fixedClock(MONDAY));
    await getSql()`DELETE FROM reports_private WHERE id = ${ids[1]}`; // 30-day retention
    await getSql()`UPDATE report_structured SET withdrawn_at = now() WHERE report_id = ${ids[0]}`;
    expect(await recheckReleasesForReport(getSql(), ids[0], new Date())).toHaveLength(0);
  });

  it("expires after 35 days and supports emergency suppression", async () => {
    for (let i = 0; i < 5; i++) await approved(`e${i}`);
    await runWeeklyAggregation(getSql(), fixedClock(MONDAY));
    const [rel] = await getSql()`SELECT id, expires_at, released_at FROM aggregate_releases`;
    expect(new Date(rel.expires_at).getTime() - new Date(rel.released_at).getTime()).toBe(35 * DAY);
    await getSql()`UPDATE aggregate_releases SET expires_at = now() - interval '1 second'`;
    expect((await know("late")).community.coverage).toBe("no_recent_community_data");
    await getSql()`UPDATE aggregate_releases SET expires_at = now() + interval '1 day'`;
    expect((await know("late")).community.coverage).toBe("multiple_independent_recent_observations");
    const [session] = await getSql()`INSERT INTO admin_sessions (token_hash, expires_at) VALUES (${randomUUID()}, now() + interval '1 hour') RETURNING id`;
    expect(await suppressRelease(getSql(), rel.id, "privacy_risk", session.id, new Date())).toBe(true);
    expect((await know("late")).community.coverage).toBe("no_recent_community_data");
  });
});
