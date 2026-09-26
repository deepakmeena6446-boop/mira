import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { getMailer, resetMailer } from "@/server/mail";
import { fixedClock } from "@/server/clock";
import { recordHeartbeat } from "@/server/health/worker";
import { processJourneys } from "@/server/journey/worker";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as acceptPOST } from "@/app/api/invites/accept/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as loginPOST } from "@/app/api/admin/login/route";
import { GET as readyGET } from "@/app/api/health/ready/route";
import { applyTestEnv, TEST_ADMIN_PASSWORD } from "../setup/test-env";
import { newJar, switchJar, type Jar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

/**
 * Production email path: Resend's HTTPS API, stubbed at `fetch` (no network). Every other
 * fetch passes through untouched.
 */
const RESEND_ENV = { RESEND_API_KEY: "re_test_only_key", EMAIL_FROM: "MIRA <alerts@mira.test>" };
const HOME = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };

type Sent = { auth: string | null; idempotencyKey: string | null; body: { from: string; to: string[]; subject: string; text: string } };
let sent: Sent[] = [];
let resendStatus = 200;
const realFetch = globalThis.fetch;

function stubResend() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== "https://api.resend.com/emails") return realFetch(input, init);
    const headers = new Headers(init?.headers);
    sent.push({ auth: headers.get("authorization"), idempotencyKey: headers.get("idempotency-key"), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(resendStatus < 300 ? { id: randomUUID() } : { message: "nope" }), { status: resendStatus });
  });
}

async function signIn(name: string): Promise<Jar> {
  const jar = newJar();
  switchJar(jar);
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
  return jar;
}

/** Owner with one accepted contact (invite delivered through the Resend stub) and a shared trip that is now overdue. */
async function overdueSharedTrip(owner: string, email: string): Promise<string> {
  const jar = await signIn(owner);
  await contactsPOST(jsonRequest("/api/me/contacts", { name: "Didi", email }));
  const invite = sent.find((s) => s.body.to[0] === email && /invited/i.test(s.body.subject));
  expect(invite, "invite went through Resend").toBeTruthy();
  const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(invite!.body.text)![1];
  const contactJar = newJar();
  contactJar.set("mira_invite", token);
  switchJar(contactJar);
  expect((await (await acceptPOST(jsonRequest("/api/invites/accept", {}))).json()).status).toBe("accepted");
  switchJar(jar);
  const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Hostel" }, share: true }))).json();
  await getSql()`UPDATE journeys SET created_at = now() - interval '40 minutes', eta_at = now() - interval '11 minutes' WHERE id = ${trip.id}`;
  return trip.id as string;
}

async function alertState(id: string): Promise<string> {
  const [row] = await getSql()`SELECT alert_state FROM journeys WHERE id = ${id}`;
  return row.alert_state as string;
}

function useEnv(overrides: Record<string, string | undefined>) {
  applyTestEnv(overrides);
  resetEnvCache();
  resetMailer();
}

describe("email provider: Resend in production, honest when absent", () => {
  beforeAll(async () => {
    await loadFixturePilot(getSql());
  });
  beforeEach(async () => {
    sent = [];
    resendStatus = 200;
    useEnv(RESEND_ENV);
    stubResend();
    const sql = getSql();
    await sql`DELETE FROM abuse_counters`;
    await sql`DELETE FROM journeys`;
    await recordHeartbeat(sql, "email-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(() => {
    useEnv({});
  });

  it("sends invites, the trip link and exactly one missed-arrival alert through Resend; the alert is recorded sent", async () => {
    const email = `resend-${randomUUID().slice(0, 6)}@example.test`;
    const id = await overdueSharedTrip("Meera", email);
    expect(sent.some((s) => s.body.to[0] === email && s.body.subject.includes("sharing a trip"))).toBe(true);

    const tick = await processJourneys(getSql(), fixedClock(new Date()), getMailer());
    expect(tick).toMatchObject({ missed: 1, alertsSent: 1 });
    await processJourneys(getSql(), fixedClock(new Date(Date.now() + 60_000)), getMailer());
    expect(await alertState(id)).toBe("sent");

    const alerts = sent.filter((s) => s.body.to[0] === email && s.body.subject.includes("missed"));
    expect(alerts).toHaveLength(1);
    for (const s of sent) {
      expect(s.auth).toBe("Bearer re_test_only_key");
      expect(s.body.from).toBe("MIRA <alerts@mira.test>");
      expect(s.idempotencyKey).toMatch(/^mira-/);
    }
    expect(new Set(sent.map((s) => s.idempotencyKey)).size).toBe(sent.length); // distinct messages never share a key
    expect(alerts[0].body.text).not.toMatch(/28\.\d{3}|77\.\d{3}/);
  });

  it("a Resend refusal (4xx) is recorded failed, never sent", async () => {
    const id = await overdueSharedTrip("Asha", `refused-${randomUUID().slice(0, 6)}@example.test`);
    resendStatus = 422;
    const tick = await processJourneys(getSql(), fixedClock(new Date()), getMailer());
    expect(tick).toMatchObject({ missed: 1, alertsSent: 0, alertsFailed: 1 });
    expect(await alertState(id)).toBe("failed");
  });

  it("with no email provider a missed arrival is recorded not_attempted and nothing is sent", async () => {
    const id = await overdueSharedTrip("Neha", `none-${randomUUID().slice(0, 6)}@example.test`);
    useEnv({}); // provider removed (e.g. key revoked) before the ETA passes
    const before = sent.length;
    expect(getMailer()).toBeNull();
    const tick = await processJourneys(getSql(), fixedClock(new Date()), getMailer());
    expect(tick).toMatchObject({ missed: 1, alertsSent: 0 });
    expect(await alertState(id)).toBe("not_attempted");
    expect(sent.length).toBe(before);
  });
});

describe("readiness", () => {
  afterAll(() => {
    useEnv({});
  });

  it("is 503 while the worker is stale and 200 once it beats; public body is only {status}", async () => {
    useEnv({});
    const sql = getSql();
    await sql`DELETE FROM worker_heartbeats`;
    switchJar(newJar());
    const down = await readyGET();
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ status: "unavailable" });
    await recordHeartbeat(sql, "ready-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());
    const up = await readyGET();
    expect(up.status).toBe(200);
    expect(await up.json()).toEqual({ status: "ready" });
  });

  it("shows a moderator the checks, including which email and Mira providers are live, without secrets", async () => {
    useEnv(RESEND_ENV);
    const sql = getSql();
    await sql`DELETE FROM abuse_counters`;
    await recordHeartbeat(sql, "ready-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());
    switchJar(newJar());
    expect((await loginPOST(jsonRequest("/api/admin/login", { password: TEST_ADMIN_PASSWORD }))).status).toBe(200);
    const res = await readyGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "ready",
      checks: {
        database: "ok",
        worker: "ok",
        workerHeartbeatAgeSeconds: expect.any(Number),
        pilotMapData: expect.stringMatching(/^(ok|unavailable)$/),
        contactEmail: expect.stringMatching(/^(ok|degraded)$/),
        contactEmailProvider: "resend",
        contactAlertProblems24h: expect.any(Number),
        mira: "placeholder",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/re_test_only_key|alerts@mira\.test/);
  });
});
