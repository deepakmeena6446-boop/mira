import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetMailer } from "@/server/mail";
import { recordHeartbeat } from "@/server/health/worker";
import { dailyKey } from "@/server/ratelimit";
import { chosenMinutes, etaFor } from "@/server/trips";
import { processJourneys } from "@/server/journey/worker";
import { systemClock } from "@/server/clock";
import { encryptText, hmacHex } from "@/server/crypto";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { GET as meGET } from "@/app/api/me/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { GET as currentGET } from "@/app/api/trips/current/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { POST as routePOST } from "@/app/api/geo/route/route";
import { POST as helpPOST } from "@/app/api/geo/help/route";
import { POST as miraPOST, MIRA_DAILY_MAX } from "@/app/api/mira/route";
import { RESTING_NOTE } from "@/server/providers/companion";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const HOME = { lat: 28.6901, lon: 77.2111 }; // Fixture Pharmacy (test-only grid)
const START = { lat: 28.6927, lon: 77.2131 }; // by Fixture Metro Gate 1
const VERDICTS = /\b(safe|safer|safest|unsafe|dangerous|danger|risky|avoid)\b/i;

async function beat() {
  await recordHeartbeat(getSql(), "ctx-worker", new Date(), "test", new Date());
  await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
}

async function signIn(name: string) {
  switchJar(newJar());
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
}

describe("journey context: route, Help Points, options, safety net", () => {
  beforeAll(async () => {
    applyTestEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_FROM: "MIRA <no-reply@mira.test>" });
    resetEnvCache();
    resetMailer();
    await loadFixturePilot(getSql());
    await getSql()`DELETE FROM abuse_counters`;
  });

  it("a route carries its Help Points in the order she'd pass them, with hours only as the source lists them", async () => {
    switchJar(newJar());
    const r = await (await routePOST(jsonRequest("/api/geo/route", { from: START, to: HOME }))).json();
    expect(r.route.approximate).toBe(false);
    expect(Array.isArray(r.alternatives)).toBe(true);
    const names = r.helpPoints.map((p: { name: string }) => p.name);
    expect(names).toEqual(["Fixture Metro Gate 1", "Fixture Pharmacy"]); // metro at the start, pharmacy at the end
    const pharmacy = r.helpPoints[1];
    expect(pharmacy).toMatchObject({ cls: "pharmacy", open24h: false, hours: "Mo-Sa 09:00-21:00", source: "osm" });
    expect(r.helpPoints[0].alongM).toBeLessThan(pharmacy.alongM);
    expect(names).not.toContain("Fixture Toiletries"); // a chemist *shop* isn't a Help Point
    expect(JSON.stringify(r)).not.toMatch(VERDICTS);
    // Deterministic: the same request gives the same answer.
    const again = await (await routePOST(jsonRequest("/api/geo/route", { from: START, to: HOME }))).json();
    expect(again.helpPoints).toEqual(r.helpPoints);
  });

  it("an approximate (straight-line) route claims no lighting and no Help Points along it", async () => {
    const r = await (await routePOST(jsonRequest("/api/geo/route", { from: { lat: 51.5007, lon: -0.1246 }, to: { lat: 51.5033, lon: -0.1196 } }))).json();
    expect(r.route.approximate).toBe(true);
    expect(r.lighting).toBeNull();
    expect(r.helpPoints).toEqual([]);
    expect(r.alternatives).toEqual([]);
  });

  it("Help Points near a spot are staffed kinds of places only", async () => {
    const r = await (await helpPOST(jsonRequest("/api/geo/help", HOME))).json();
    const names = r.helpPoints.map((p: { name: string }) => p.name);
    expect(names).toContain("Fixture Pharmacy");
    expect(names).toContain("Fixture Metro Gate 1");
    expect(names).not.toContain("Fixture Toiletries");
    expect(names[0]).toBe("Fixture Pharmacy"); // nearest first
    expect((await helpPOST(jsonRequest("/api/geo/help", { lat: 999, lon: 0 }))).status).toBe(400);
  });

  it("a chosen longer route makes the ETA later, but never absurdly so", async () => {
    expect(chosenMinutes(10, undefined)).toBe(10);
    expect(chosenMinutes(10, 12)).toBe(12);
    expect(chosenMinutes(10, 5)).toBe(10); // never earlier than the fastest walk
    expect(chosenMinutes(10, 200)).toBe(16); // capped at 1.6× the fastest
    await beat();
    await signIn("Route Chooser");
    const now = Date.now();
    const res = await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false, routeMinutes: 200 }));
    expect(res.status).toBe(201);
    const { trip } = await res.json();
    const fastest = (await (await routePOST(jsonRequest("/api/geo/route", { from: START, to: HOME }))).json()).route.minutes;
    const expected = etaFor(chosenMinutes(fastest, 200), new Date(now)).getTime();
    expect(Math.abs(new Date(trip.etaAt).getTime() - expected)).toBeLessThan(5_000);
    await tripActionPOST(jsonRequest(`/api/trips/${trip.id}/end`, {}), { params: Promise.resolve({ id: trip.id, action: "end" }) });
    expect((await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, routeMinutes: 9999 }))).status).toBe(400);
  });

  it("an open journey is told when missed-arrival checks would not go out", async () => {
    await beat();
    await signIn("Net Checker");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false }))).json();
    expect((await (await currentGET()).json()).safetyNet).toEqual({ worker: true, email: true });
    await getSql()`DELETE FROM worker_heartbeats`;
    expect((await (await currentGET()).json()).safetyNet).toEqual({ worker: false, email: true });
    await beat();
    await tripActionPOST(jsonRequest(`/api/trips/${trip.id}/end`, {}), { params: Promise.resolve({ id: trip.id, action: "end" }) });
  });

  it("an alert claim that never completed is reported to the traveller, not left as 'emailing…'", async () => {
    await beat();
    await signIn("Stale Claim");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false }))).json();
    await getSql()`UPDATE journeys SET state = 'missed', missed_at = now(), alert_state = 'claimed', alert_claimed_at = now() - interval '20 minutes' WHERE id = ${trip.id}`;
    const r = await processJourneys(getSql(), systemClock, null);
    expect(r.alertsUnconfirmed).toBeGreaterThanOrEqual(1);
    const [j] = await getSql()`SELECT alert_state, user_id FROM journeys WHERE id = ${trip.id}`;
    expect(j.alert_state).toBe("unconfirmed");
    const notes = await getSql()`SELECT kind FROM notifications WHERE user_id = ${j.user_id} AND kind = 'trip_alert_failed'`;
    expect(notes).toHaveLength(1);
  });

  it("a missed-arrival alert that reached only some contacts says who may not have been told", async () => {
    await beat();
    await signIn("Partial Alert");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false }))).json();
    const [j] = await getSql()`SELECT user_id FROM journeys WHERE id = ${trip.id}`;
    const contact = async (name: string, email: string) =>
      (await getSql()`INSERT INTO contacts (user_id, name, encrypted_email, email_hash, accepted_at) VALUES (${j.user_id}, ${name}, ${encryptText(email, "contact_email")}, ${hmacHex("contact-email", `${name}-${Date.now()}`)}, now()) RETURNING id`)[0].id;
    for (const [name, email] of [["Priya", "priya@example.test"], ["Ravi", "ravi@example.test"]] as const) {
      await getSql()`INSERT INTO trip_contacts (journey_id, contact_id) VALUES (${trip.id}, ${await contact(name, email)})`;
    }
    await getSql()`UPDATE journeys SET eta_at = now() - interval '20 minutes' WHERE id = ${trip.id}`;
    const mailer = { send: async (m: { to: string }) => (m.to.startsWith("priya") ? { ok: true as const } : { ok: false as const, definite: true }) };
    await processJourneys(getSql(), systemClock, mailer as never);
    const [after] = await getSql()`SELECT alert_state FROM journeys WHERE id = ${trip.id}`;
    expect(after.alert_state).toBe("sent"); // someone was reached…
    const notes = await getSql()`SELECT body FROM notifications WHERE user_id = ${j.user_id} AND kind = 'trip_alert_failed'`;
    expect(notes).toHaveLength(1); // …and the traveller is told exactly who may not have been
    expect(notes[0].body).toContain("Ravi");
    expect(notes[0].body).not.toContain("Priya");
  });

  // The cap bounds model spend, not access: past it the scripted engine answers (so a danger
  // message still gets the Emergency card; see mira-intelligence.test.ts). Bursts still get 429.
  it(`Mira's model is capped at ${MIRA_DAILY_MAX} messages per person per day; past it the scripted Mira answers`, async () => {
    expect(MIRA_DAILY_MAX).toBe(60);
    await signIn("Chatty");
    const { user } = await (await meGET()).json();
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000);
    await getSql()`INSERT INTO abuse_counters (key_hmac, bucket, window_start, count, expires_at)
                   VALUES (${dailyKey("actor", user.id, now)}, 'mira:d', ${windowStart}, ${MIRA_DAILY_MAX}, ${new Date(now.getTime() + 86_400_000)})`;
    const res = await miraPOST(jsonRequest("/api/mira", { message: "hi", context: { localTime: now.toISOString(), tzOffsetMin: 0, location: null } }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(JSON.stringify({ type: "text", delta: RESTING_NOTE }));
  });
});
