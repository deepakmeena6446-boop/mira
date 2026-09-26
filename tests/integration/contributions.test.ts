import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { randomBytes, randomUUID } from "node:crypto";
import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { fixedClock, systemClock } from "@/server/clock";
import { recordHeartbeat } from "@/server/health/worker";
import { addLocation, ARRIVAL_DWELL_MS } from "@/server/trips";
import { deleteAccount } from "@/server/account/users";
import { getGeo, type GeoProvider } from "@/server/providers/geo";
import { parseOpeningHours } from "@/domain/opening-hours";
import { encodeGeohash } from "@/domain/geohash";
import type { HelpPoint } from "@/domain/help-points";
import { decidePending, placeStatusFor, prepareChecks, recordPlaceSignal } from "@/server/contributions";
import { recordLitVote } from "@/server/lighting";
import { recordLightingReceipt } from "@/server/contributions";
import { runWeeklyAggregation } from "@/server/aggregate/run";
import { purgeExpired } from "@/server/retention";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { GET as meGET } from "@/app/api/me/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { POST as reportsPOST } from "@/app/api/reports/route";
import { POST as votePOST } from "@/app/api/lighting/vote/route";
import { GET as contributeGET } from "@/app/api/contribute/route";
import { POST as checkPOST } from "@/app/api/contribute/check/[id]/route";
import { POST as correctionPOST } from "@/app/api/contribute/correction/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { fixturePlaceId, loadFixturePilot } from "../helpers/pilot";

/** Fixture places (tests/fixtures/osm-grid.ts): metro gate (no listed hours) and pharmacy (Mo-Sa 09:00-21:00). */
const GATE = { lat: 28.6926, lon: 77.2131 };
const PHARMACY = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };
const MID = { lat: 28.6914, lon: 77.2121 };
const FAR_A = { lat: 28.7, lon: 77.222 };
const FAR_B = { lat: 28.7009, lon: 77.222 };
let gateId = "";
let pharmacyId = "";

/** A Help Point lookup that returns the two fixture places (deterministic; no live providers). */
function stubGeo(): GeoProvider & { calls: number } {
  const base = getGeo();
  const g = {
    ...base,
    calls: 0,
    async helpPlaces(): Promise<HelpPoint[]> {
      g.calls++;
      return [
        { id: gateId, name: "Fixture Metro Gate 1", cls: "transit", ...GATE, open24h: false, hours: null, schedule: null, source: "osm" },
        { id: pharmacyId, name: "Fixture Pharmacy", cls: "pharmacy", ...PHARMACY, open24h: false, hours: "Mo-Sa 09:00-21:00", schedule: parseOpeningHours("Mo-Sa 09:00-21:00"), source: "osm" },
      ];
    },
  };
  return g;
}

async function signIn(name: string, durable = true) {
  const jar = newJar();
  switchJar(jar);
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
  const { user } = await (await meGET()).json();
  // TEST-ONLY: stands in for the email sign-in that makes an account durable.
  if (durable) await getSql()`UPDATE users SET email_hash = ${randomBytes(32).toString("hex")} WHERE id = ${user.id}`;
  return { jar, id: user.id as string, use: () => switchJar(jar) };
}

const action = (id: string, a: string) => tripActionPOST(jsonRequest(`/api/trips/${id}/${a}`, {}), { params: Promise.resolve({ id, action: a }) });
const contribute = async () => (await contributeGET(new Request("http://localhost:3100/api/contribute", { headers: { origin: "http://localhost:3100", "x-mira-request": "1" } }))).json();
const answer = (id: string, a: string) => checkPOST(jsonRequest(`/api/contribute/check/${id}`, { answer: a }), { params: Promise.resolve({ id }) });

/** A walk START → (points) → arrival, closed with "I'm here" (or auto-arrival). Returns the journey id. */
async function walk(user: { id: string; use: () => void }, points: Array<{ lat: number; lon: number }>, how: "manual" | "auto" = "manual", from = START) {
  user.use();
  const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...PHARMACY, name: "Pharmacy" }, share: false }))).json();
  const t0 = Date.now();
  for (let i = 0; i < points.length; i++) await addLocation(getSql(), user.id, trip.id, { ...points[i], accuracy: 10 }, { now: () => new Date(t0 + i * 30_000) });
  if (how === "auto") {
    const t1 = t0 + points.length * 30_000;
    await addLocation(getSql(), user.id, trip.id, { ...PHARMACY, accuracy: 10 }, { now: () => new Date(t1) });
    const r = await addLocation(getSql(), user.id, trip.id, { ...PHARMACY, accuracy: 10 }, { now: () => new Date(t1 + ARRIVAL_DWELL_MS + 1000) });
    expect(r.arrived).toBe(true);
  } else expect((await action(trip.id, "arrive")).status).toBe(200);
  return trip.id as string;
}

describe("Contribute: MIRA Checks, receipts, corroboration, privacy", () => {
  beforeAll(async () => {
    applyTestEnv();
    resetEnvCache();
    const sql = getSql();
    await loadFixturePilot(sql);
    gateId = await fixturePlaceId(sql, "Fixture Metro Gate 1");
    pharmacyId = await fixturePlaceId(sql, "Fixture Pharmacy");
  });
  beforeEach(async () => {
    const sql = getSql();
    await sql`DELETE FROM abuse_counters`;
    await sql`DELETE FROM place_signals`;
    await sql`DELETE FROM contribution_receipts`;
    await sql`DELETE FROM mira_checks`;
    await recordHeartbeat(sql, "contrib-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());
  });
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
  });

  it("offers at most one check per walk, only with journey evidence, only for places she passed", async () => {
    const sql = getSql();
    const geo = stubGeo();
    const a = await signIn("Asha");
    // Evidence: points passing the gate and the pharmacy → exactly ONE check (the gate: its hours aren't listed).
    const j1 = await walk(a, [START, MID, PHARMACY], "auto");
    const [captured] = await sql`SELECT state, evidence_enc, subject_key FROM mira_checks WHERE journey_id = ${j1}`;
    expect(captured).toMatchObject({ state: "preparing", subject_key: null });
    expect(String(captured.evidence_enc)).toMatch(/^v1\./); // the points are encrypted, and the journey's own points are gone
    expect((await sql`SELECT count(*)::int AS n FROM trip_locations WHERE journey_id = ${j1}`)[0].n).toBe(0);
    expect(await prepareChecks(sql, geo, new Date())).toEqual({ ready: 1, none: 0 });
    expect(geo.calls).toBe(1); // one Help Point lookup per journey
    const rows = await sql`SELECT * FROM mira_checks WHERE user_id = ${a.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "ready", subject_key: gateId, subject_name: "Fixture Metro Gate 1", evidence_enc: null, provider_open: null });
    a.use();
    const body = await contribute();
    expect(body.checks).toHaveLength(1);
    expect(body.checks[0]).toMatchObject({ question: "Was Fixture Metro Gate 1 open when you passed?", placeName: "Fixture Metro Gate 1", journeyId: j1 });
    expect(JSON.stringify(body)).not.toMatch(/lat|lon|evidence|subject_key/);

    // No journey evidence (only the start point): no check at all.
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...PHARMACY, name: "Pharmacy" }, share: false }))).json();
    await action(trip.id, "arrive");
    expect((await sql`SELECT count(*)::int AS n FROM mira_checks WHERE journey_id = ${trip.id}`)[0].n).toBe(0);

    // Evidence, but no Help Point within 60 m of where she walked: nothing is asked.
    const j3 = await walk(a, [FAR_A, FAR_B], "manual", FAR_A);
    await prepareChecks(sql, geo, new Date());
    expect((await sql`SELECT count(*)::int AS n FROM mira_checks WHERE journey_id = ${j3}`)[0].n).toBe(0);

    // A first-name-only account can't give place signals, so it's never asked.
    const d = await signIn("Demo", false);
    const j4 = await walk(d, [START, MID]);
    expect((await sql`SELECT count(*)::int AS n FROM mira_checks WHERE journey_id = ${j4}`)[0].n).toBe(0);
  });

  it("an answer is pending until an independent person agrees; then both are verified and counted", async () => {
    const sql = getSql();
    const geo = stubGeo();
    const a = await signIn("Bina");
    await walk(a, [START, MID]);
    await prepareChecks(sql, geo, new Date());
    a.use();
    const [ca] = (await contribute()).checks;
    const ra = await (await answer(ca.id, "open")).json();
    expect(ra).toMatchObject({ recorded: true, outcome: "pending" });
    expect((await answer(ca.id, "open")).status).toBe(409); // can't answer twice
    let mine = await contribute();
    expect(mine.checks).toHaveLength(0);
    expect(mine.impact.summary).toMatchObject({ verified: 0, pending: 1 });
    expect(mine.impact.line).toBeNull();

    const b = await signIn("Chitra");
    await walk(b, [START, MID]);
    await prepareChecks(sql, geo, new Date());
    b.use();
    const [cb] = (await contribute()).checks;
    expect((await (await answer(cb.id, "open")).json()).outcome).toBe("verified");
    expect((await contribute()).impact).toMatchObject({ summary: { verified: 1, pending: 0 }, line: "You helped verify 1 piece of local information." });

    // The first person's receipt is decided by the worker job.
    expect((await decidePending(sql, new Date())).verified).toBe(1);
    a.use();
    mine = await contribute();
    expect(mine.impact.summary).toMatchObject({ verified: 1, pending: 0, byKind: { place_status: 1 } });
    // The subject link is gone once decided; checks keep no place after the answer.
    const receipts = await sql`SELECT status, verified_by, subject_enc, counted FROM contribution_receipts`;
    expect(receipts).toHaveLength(2);
    expect(receipts.every((r) => r.status === "verified" && r.verified_by === "corroboration" && r.subject_enc === null && r.counted)).toBe(true);
    expect((await sql`SELECT count(*)::int AS n FROM mira_checks WHERE subject_key IS NOT NULL OR subject_name IS NOT NULL`)[0].n).toBe(0);

    // What Help Points will read: corroborated "open" at that weekday × band, no single-voice effects.
    const [sig] = await sql`SELECT weekday, band FROM place_signals LIMIT 1`;
    const status = (await placeStatusFor(sql, [gateId, pharmacyId], { weekday: sig.weekday, band: sig.band })).get(gateId);
    expect(status).toMatchObject({ openAtThisTime: true, closedAtThisTime: false, gone: false, reportsDiffer: false });
    expect((await placeStatusFor(sql, [pharmacyId], { weekday: sig.weekday, band: sig.band })).size).toBe(0);
  });

  it("the same person twice never corroborates herself, even in a later week", async () => {
    const sql = getSql();
    const c = await signIn("Divya");
    const base = { userId: c.id, kind: "place_status" as const, placeKey: gateId, claim: "open" as const, weekday: 2, band: "evening" as const, providerAgrees: null, area5: "ttnfv", country: "IN" };
    const now = new Date();
    expect(await recordPlaceSignal(sql, { ...base, now })).toBe("pending");
    expect(await recordPlaceSignal(sql, { ...base, now })).toBe("duplicate");
    expect(await recordPlaceSignal(sql, { ...base, now: new Date(now.getTime() + 8 * 86_400_000) })).toBe("duplicate");
    expect((await sql`SELECT count(*)::int AS n FROM place_signals`)[0].n).toBe(1);
    await decidePending(sql, new Date(now.getTime() + 9 * 86_400_000));
    expect((await sql`SELECT status FROM contribution_receipts WHERE user_id = ${c.id}`).map((r) => r.status)).toEqual(["pending"]);
  });

  it("contradiction: reports differ and nobody is credited", async () => {
    const sql = getSql();
    const d = await signIn("Esha");
    const e = await signIn("Farah");
    const now = new Date();
    const base = { kind: "place_status" as const, placeKey: gateId, weekday: 4, band: "late" as const, providerAgrees: null, area5: "ttnfv", country: null, now };
    expect(await recordPlaceSignal(sql, { ...base, userId: d.id, claim: "open" })).toBe("pending");
    expect(await recordPlaceSignal(sql, { ...base, userId: e.id, claim: "closed" })).toBe("contradicted");
    await decidePending(sql, now);
    const rows = await sql`SELECT status, counted, subject_enc FROM contribution_receipts`;
    expect(rows.map((r) => r.status).sort()).toEqual(["contradicted", "contradicted"]);
    expect(rows.every((r) => !r.counted && r.subject_enc === null)).toBe(true);
    d.use();
    expect((await contribute()).impact.summary).toMatchObject({ verified: 0, differed: 1 });
    expect((await placeStatusFor(sql, [gateId], { weekday: 4, band: "late" })).get(gateId)).toMatchObject({ reportsDiffer: true, openAtThisTime: false, closedAtThisTime: false });
  });

  it("one person + agreeing listed hours verifies (provider confirmation); diminishing returns count a subject once", async () => {
    const sql = getSql();
    const f = await signIn("Gita");
    const now = new Date();
    const base = { userId: f.id, kind: "place_status" as const, placeKey: pharmacyId, weekday: 0, band: "day" as const, area5: "ttnfv", country: "IN" };
    expect(await recordPlaceSignal(sql, { ...base, claim: "open", providerAgrees: true, now })).toBe("verified");
    const [r] = await sql`SELECT verified_by, counted FROM contribution_receipts WHERE user_id = ${f.id}`;
    expect(r).toMatchObject({ verified_by: "provider", counted: true });
    // 29 days later (window over) she confirms the same fact again: verified, but it doesn't count twice.
    expect(await recordPlaceSignal(sql, { ...base, claim: "open", providerAgrees: true, now: new Date(now.getTime() + 29 * 86_400_000) })).toBe("verified");
    const counted = await sql`SELECT counted FROM contribution_receipts WHERE user_id = ${f.id} ORDER BY created_at`;
    expect(counted.map((x) => x.counted)).toEqual([true, false]);
  });

  it("corrections: structured, durable accounts only, ≥ 2 independent people, rate limited", async () => {
    const sql = getSql();
    const demo = await signIn("Hema", false);
    demo.use();
    const body = { name: "Fixture Pharmacy", ...PHARMACY, claim: "gone" };
    expect((await correctionPOST(jsonRequest("/api/contribute/correction", body))).status).toBe(403);
    expect((await correctionPOST(jsonRequest("/api/contribute/correction", { ...body, note: "free text" }))).status).toBe(400);

    const g = await signIn("Isha");
    const r1 = await (await correctionPOST(jsonRequest("/api/contribute/correction", body))).json();
    expect(r1).toMatchObject({ ok: true, outcome: "pending", placeName: "Fixture Pharmacy" });
    const h = await signIn("Jaya");
    expect((await (await correctionPOST(jsonRequest("/api/contribute/correction", body))).json()).outcome).toBe("verified");
    await decidePending(sql, new Date());
    expect((await placeStatusFor(sql, [pharmacyId], { weekday: 0, band: "day" })).get(pharmacyId)).toMatchObject({ gone: true });
    expect((await sql`SELECT count(*)::int AS n FROM contribution_receipts WHERE status = 'verified' AND kind = 'correction'`)[0].n).toBe(2);
    // An unknown place can't be corrected (the key always comes from the provider, never the client).
    expect((await correctionPOST(jsonRequest("/api/contribute/correction", { ...body, name: "Nowhere Special", lat: 28.7, lon: 77.222 }))).status).toBe(400);

    // Rate limit: 10 corrections a day per person (duplicates included).
    g.use();
    await sql`DELETE FROM abuse_counters`;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await correctionPOST(jsonRequest("/api/contribute/correction", { ...body, claim: "hours_wrong" }))).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    void h;
  });

  it("an incident report never creates a receipt or any reward", async () => {
    const sql = getSql();
    const k = await signIn("Kiran");
    const r = await reportsPOST(jsonRequest("/api/reports", { idempotencyKey: randomUUID(), involvement: "witnessed", category: "environment", location: PHARMACY, recency: "today", timeBand: "late" }));
    expect(r.status).toBe(201);
    expect((await sql`SELECT count(*)::int AS n FROM contribution_receipts WHERE user_id = ${k.id}`)[0].n).toBe(0);
    expect((await contribute()).impact.summary).toMatchObject({ verified: 0, pending: 0, differed: 0 });
  });

  it("lighting answers get a private receipt decided by the existing walker rule; one person across weeks is one voice", async () => {
    const sql = getSql();
    await sql`DELETE FROM lit_votes`;
    const ROUTE: Array<[number, number]> = [[77.2, 28.69], [77.2031, 28.69]];
    // One person answering in three different weeks: three lit_votes rows per cell, but never her own corroboration.
    const solo = await signIn("Lata");
    const t0 = Date.now();
    for (let w = 0; w < 3; w++) {
      const at = new Date(t0 + w * 7 * 86_400_000);
      await recordLitVote(sql, solo.id, ROUTE, "lit", at);
      await recordLightingReceipt(sql, solo.id, ROUTE, "lit", at);
    }
    await decidePending(sql, new Date(t0 + 15 * 86_400_000));
    expect((await sql`SELECT status FROM contribution_receipts WHERE user_id = ${solo.id}`).every((r) => r.status === "pending")).toBe(true);
    await sql`DELETE FROM lit_votes`;
    await sql`DELETE FROM contribution_receipts`;

    const ids: string[] = [];
    for (const name of ["Mona", "Nina", "Oja"]) {
      const u = await signIn(name);
      ids.push(u.id);
      const res = await (await votePOST(jsonRequest("/api/lighting/vote", { route: ROUTE, vote: "lit" }))).json();
      expect(res.receipt).toBe(name === "Oja" ? "verified" : "pending");
    }
    // Same person, same week, same stretch: not a new contribution.
    expect((await (await votePOST(jsonRequest("/api/lighting/vote", { route: ROUTE, vote: "lit" }))).json()).receipt).toBe("duplicate");
    await decidePending(sql, new Date());
    const rows = await sql`SELECT user_id, status, subject_enc, area_key FROM contribution_receipts`;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "verified" && r.subject_enc === null && /^[0-9a-f]{64}$/.test(r.area_key))).toBe(true);
    // lit_votes still carries nothing about who (unchanged design).
    const cols = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'lit_votes'`).map((c) => c.column_name).sort();
    expect(cols).toEqual(["cell", "day", "id", "value", "voter_hash"]);
  });

  it("deleting the account deletes receipts and checks; signals stay and are unlinkable", async () => {
    const sql = getSql();
    const p = await signIn("Pia");
    const q = await signIn("Quinn");
    const now = new Date();
    for (const u of [p, q]) await recordPlaceSignal(sql, { userId: u.id, kind: "place_status", placeKey: gateId, claim: "open", weekday: 1, band: "day", providerAgrees: null, area5: "ttnfv", country: "IN", now });
    await walk(p, [START, MID]);
    expect((await sql`SELECT count(*)::int AS n FROM mira_checks WHERE user_id = ${p.id}`)[0].n).toBe(1);
    await deleteAccount(sql, p.id);
    expect((await sql`SELECT count(*)::int AS n FROM contribution_receipts WHERE user_id = ${p.id}`)[0].n).toBe(0);
    expect((await sql`SELECT count(*)::int AS n FROM mira_checks WHERE user_id = ${p.id}`)[0].n).toBe(0);
    expect((await sql`SELECT count(*)::int AS n FROM place_signals WHERE place_key = ${gateId}`)[0].n).toBe(2);
    const cols = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'place_signals'`).map((c) => c.column_name).sort();
    expect(cols).toEqual(["band", "claim", "claim_group", "day", "id", "place_key", "voter_hash", "weekday"]); // no user, no trip, no time of day
    const signalText = JSON.stringify(await sql`SELECT * FROM place_signals`);
    expect(signalText).not.toContain(p.id);
    expect(signalText).not.toContain(q.id);
  });

  it("retention: checks ≤ 24 h, pending receipts expire with their link deleted, old signals go", async () => {
    const sql = getSql();
    const r = await signIn("Rhea");
    const now = new Date();
    await recordPlaceSignal(sql, { userId: r.id, kind: "correction", placeKey: gateId, claim: "wrong_kind", weekday: null, band: null, providerAgrees: null, area5: null, country: null, now });
    await walk(r, [START, MID]);
    const later = new Date(now.getTime() + 31 * 86_400_000);
    const counts = await purgeExpired(sql, later);
    expect(counts).toMatchObject({ miraChecks: 1, receiptsExpired: 1 });
    expect(await sql`SELECT status, subject_enc FROM contribution_receipts WHERE user_id = ${r.id}`).toEqual([{ status: "expired", subject_enc: null }]);
    const muchLater = new Date(now.getTime() + 62 * 86_400_000);
    expect(await purgeExpired(sql, muchLater)).toMatchObject({ receipts: 1, placeSignals: 1 });
  });
});

describe("public community notes are off by default (PUBLIC_AGGREGATE_RELEASES)", () => {
  const MONDAY = new Date("2026-09-28T03:00:00Z");
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
  });

  it("publishes nothing when off; the same reports release when switched on", async () => {
    const sql = getSql();
    await loadFixturePilot(sql);
    await sql`DELETE FROM aggregate_releases`;
    await sql`DELETE FROM aggregate_runs`;
    await sql`DELETE FROM reports_private`;
    const cell = encodeGeohash(PHARMACY.lat, PHARMACY.lon);
    for (let i = 0; i < 5; i++) {
      const created = new Date(MONDAY.getTime() - (2 + i) * 86_400_000);
      const [row] = await sql`
        INSERT INTO reports_private (actor_hash, idempotency_key, involvement, category, coarse_cell_id, recency_bucket, time_band, status, created_at, expires_at)
        VALUES (${`contrib-a${i}`}, ${randomUUID()}, 'witnessed', 'environment', ${cell}, 'past_week', 'late', 'approved', ${created}, ${new Date(created.getTime() + 30 * 86_400_000)})
        RETURNING id`;
      await sql`INSERT INTO report_structured (report_id, category, tags, cell_id, time_band, recency_bucket, approved_at, duplicate_group)
                VALUES (${row.id}, 'environment', ${["poor_lighting"]}, ${cell}, 'late', 'past_week', ${created}, ${row.id})`;
    }
    applyTestEnv({ PUBLIC_AGGREGATE_RELEASES: undefined });
    resetEnvCache();
    expect(await runWeeklyAggregation(sql, fixedClock(MONDAY))).toMatchObject({ ran: false, disabled: true, releasesCreated: 0 });
    expect((await sql`SELECT count(*)::int AS n FROM aggregate_releases`)[0].n).toBe(0);
    expect((await sql`SELECT count(*)::int AS n FROM aggregate_runs`)[0].n).toBe(0); // nothing computed either
    applyTestEnv({ PUBLIC_AGGREGATE_RELEASES: "on" });
    resetEnvCache();
    expect(await runWeeklyAggregation(sql, fixedClock(MONDAY))).toMatchObject({ ran: true, releasesCreated: 1 });
    await sql`DELETE FROM aggregate_releases`;
    await sql`DELETE FROM aggregate_runs`;
    await sql`DELETE FROM reports_private`;
    void systemClock;
  });
});
