import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetMailer, getMailer } from "@/server/mail";
import { fixedClock, MINUTE } from "@/server/clock";
import { hmacHex } from "@/server/crypto";
import { recordHeartbeat } from "@/server/health/worker";
import { addLocation, sharedTrip, ARRIVAL_DWELL_MS } from "@/server/trips";
import { acceptContactInvite } from "@/server/account/contacts";
import { processJourneys, JOURNEYS_JOB_ID } from "@/server/journey/worker";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as signoutPOST } from "@/app/api/auth/signout/route";
import { DELETE as meDELETE } from "@/app/api/me/route";
import { POST as placesPOST } from "@/app/api/me/places/route";
import { POST as contactsPOST } from "@/app/api/me/contacts/route";
import { DELETE as contactDELETE } from "@/app/api/me/contacts/[id]/route";
import { POST as acceptPOST } from "@/app/api/invites/accept/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { POST as miraPOST, GET as miraGET } from "@/app/api/mira/route";
import { POST as routePOST } from "@/app/api/geo/route/route";
import { POST as reportPOST } from "@/app/api/reports/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar, type Jar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const MAILPIT = "http://127.0.0.1:8025/api/v1";
const mailsTo = async (to: string) =>
  ((await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as { messages: Array<{ ID: string; Subject: string }> }).messages;
const mailText = async (id: string) => ((await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string }).Text;
const HOME = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };
const ctx = (extra: Record<string, unknown> = {}) => ({ localTime: new Date().toISOString(), tzOffsetMin: -330, location: START, ...extra });

async function signIn(name: string): Promise<Jar> {
  const jar = newJar();
  switchJar(jar);
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
  return jar;
}
async function tokenFromInvite(email: string) {
  const [m] = await mailsTo(email);
  return /\/invite\/([A-Za-z0-9_-]+)/.exec(await mailText(m.ID))![1];
}
async function trustedContact(owner: Jar, name: string, tag: string) {
  const email = `${tag}-${randomUUID().slice(0, 8)}@example.test`;
  const { contact } = await (await contactsPOST(jsonRequest("/api/me/contacts", { name, email }))).json();
  const jar = newJar();
  jar.set("mira_invite", await tokenFromInvite(email));
  switchJar(jar);
  expect((await (await acceptPOST(jsonRequest("/api/invites/accept", {}))).json()).status).toBe("accepted");
  switchJar(owner);
  return { email, id: contact.id as string };
}
async function startSharedTrip(dest = "Home") {
  const res = await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: dest }, share: true }));
  expect(res.status).toBe(201);
  return (await res.json()).trip as { id: string; shareUrl: string };
}
const linkIn = async (email: string, subject: string) => {
  const m = (await mailsTo(email)).find((x) => x.Subject.includes(subject))!;
  return /\/t\/([A-Za-z0-9_-]+)/.exec(await mailText(m.ID))![1];
};

describe("audit regressions", () => {
  beforeAll(async () => {
    applyTestEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_FROM: "MIRA <no-reply@mira.test>" });
    resetEnvCache();
    resetMailer();
    await loadFixturePilot(getSql());
  });
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
    resetMailer();
  });
  beforeEach(async () => {
    const sql = getSql();
    await sql`DELETE FROM abuse_counters`;
    await sql`DELETE FROM journeys`;
    await recordHeartbeat(sql, "audit-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, JOURNEYS_JOB_ID, new Date(), "test", new Date());
  });

  it("removing a contact revokes their live link at once; the traveller's own link keeps working", async () => {
    const owner = await signIn("Anika");
    const c = await trustedContact(owner, "Ex", "ex");
    const trip = await startSharedTrip();
    const contactToken = await linkIn(c.email, "sharing a trip");
    const ownerToken = trip.shareUrl.split("/t/")[1];
    expect(await sharedTrip(getSql(), contactToken, new Date())).toMatchObject({ state: "active", alertsViewer: true });
    expect(await sharedTrip(getSql(), ownerToken, new Date())).toMatchObject({ state: "active", alertsViewer: false });

    expect((await contactDELETE(jsonRequest(`/api/me/contacts/${c.id}`, {}, { method: "DELETE" }), { params: Promise.resolve({ id: c.id }) })).status).toBe(200);
    expect(await sharedTrip(getSql(), contactToken, new Date())).toBeNull();
    expect(await sharedTrip(getSql(), ownerToken, new Date())).toMatchObject({ state: "active" });
  });

  it("vague (cell/Wi-Fi) fixes never auto-arrive a trip", async () => {
    await signIn("Bela");
    const trip = await startSharedTrip();
    const [{ user_id: uid }] = await getSql()`SELECT user_id FROM journeys WHERE id = ${trip.id}`;
    const clock = fixedClock(new Date());
    const vague = { ...HOME, accuracy: 400 };
    await addLocation(getSql(), uid, trip.id, vague, clock);
    clock.advance(ARRIVAL_DWELL_MS + 1000);
    expect((await addLocation(getSql(), uid, trip.id, vague, clock)).arrived).toBe(false);
    // Precise fixes still arrive after the dwell.
    await addLocation(getSql(), uid, trip.id, { ...HOME, accuracy: 12 }, clock);
    clock.advance(ARRIVAL_DWELL_MS + 1000);
    expect((await addLocation(getSql(), uid, trip.id, { ...HOME, accuracy: 12 }, clock)).arrived).toBe(true);
  });

  it("contact invites work once and expire after a week", async () => {
    await signIn("Chitra");
    const email = `once-${randomUUID().slice(0, 8)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Once", email }));
    const token = await tokenFromInvite(email);
    expect(await acceptContactInvite(getSql(), token)).toBe(true);
    expect(await acceptContactInvite(getSql(), token)).toBe(false); // single use

    const old = `old-${randomUUID().slice(0, 8)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Late", email: old }));
    await getSql()`UPDATE contacts SET invited_at = now() - interval '8 days', created_at = now() - interval '8 days' WHERE name = 'Late'`;
    expect(await acceptContactInvite(getSql(), await tokenFromInvite(old))).toBe(false);
  });

  it("names with links are refused (no phishing through invite emails)", async () => {
    await signIn("Deepa");
    const r = await contactsPOST(jsonRequest("/api/me/contacts", { name: "Win a prize at evil.com", email: `x-${randomUUID().slice(0, 6)}@example.test` }));
    expect(r.status).toBe(400);
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "http://evil" }))).status).toBe(400);
  });

  it("Mira's saved history never records where you were", async () => {
    await signIn("Esha");
    await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }));
    const streamed = async (message: string) => (await (await miraPOST(jsonRequest("/api/mira", { message, context: ctx({ area: "Kamla Nagar" }) }))).text()).trim().split("\n").map((l) => JSON.parse(l));

    const hi = await streamed("hi");
    expect(hi.filter((e) => e.type === "text").map((e) => e.delta).join("")).toMatch(/Kamla Nagar/); // you see it live…
    const home = await streamed("take me home");
    expect(home.find((e) => e.type === "card").card.minutes).toEqual(expect.any(Number));

    const { messages } = await (await miraGET()).json();
    const saved = JSON.stringify(messages);
    expect(saved).not.toMatch(/Kamla Nagar|minute walk/); // …but it isn't saved
    const tripCard = messages.flatMap((m: { cards: Array<{ type: string; minutes?: number | null }> }) => m.cards).find((c: { type: string }) => c.type === "trip");
    expect(tripCard.minutes).toBeNull();
  });

  it("one bad trip can't block everyone else's alert, and contacts hear when the person arrives", async () => {
    const a = await signIn("Farah");
    const ca = await trustedContact(a, "Gia", "gia");
    const tripA = await startSharedTrip("Hostel");
    const b = await signIn("Hema");
    const cb = await trustedContact(b, "Ila", "ila");
    const tripB = await startSharedTrip("Home");
    await getSql()`UPDATE trip_contacts SET share_token_enc = 'not-decryptable' WHERE journey_id = ${tripA.id}`;
    await getSql()`UPDATE journeys SET created_at = now() - interval '40 minutes', eta_at = now() - interval '11 minutes' WHERE id IN (${tripA.id}, ${tripB.id})`;

    const tick = await processJourneys(getSql(), fixedClock(new Date()), getMailer());
    expect(tick).toMatchObject({ failedJourneys: 1, alertsSent: 1 });
    expect((await mailsTo(cb.email)).filter((m) => m.Subject.includes("missed"))).toHaveLength(1);
    expect((await mailsTo(ca.email)).filter((m) => m.Subject.includes("missed"))).toHaveLength(0);
    const [beat] = await getSql()`SELECT last_beat_at FROM worker_heartbeats WHERE worker_id = ${JOURNEYS_JOB_ID}`;
    expect(Date.now() - new Date(beat.last_beat_at).getTime()).toBeLessThan(60_000); // the pass completed

    // Hema checks in late: Ila, who got the "missed" email, is told once.
    switchJar(b);
    expect((await tripActionPOST(jsonRequest(`/api/trips/${tripB.id}/arrive`, {}), { params: Promise.resolve({ id: tripB.id, action: "arrive" }) })).status).toBe(200);
    expect((await processJourneys(getSql(), fixedClock(new Date()), getMailer())).arrivedNotices).toBe(1);
    await processJourneys(getSql(), fixedClock(new Date(Date.now() + MINUTE)), getMailer());
    const arrived = (await mailsTo(cb.email)).filter((m) => m.Subject.includes("checked in"));
    expect(arrived).toHaveLength(1);
    expect(await mailText(arrived[0].ID)).not.toMatch(/\/t\/|28\.\d{3}/); // no link, no location
  });

  it("deleting an account leaves no report linked to it", async () => {
    await signIn("Jaya");
    const key = randomUUID();
    await reportPOST(jsonRequest("/api/reports", { idempotencyKey: key, involvement: "witnessed", category: "environment", location: START, recency: "today", timeBand: "day" }));
    const [{ user_id: uid }] = await getSql()`SELECT user_id FROM reports_private WHERE idempotency_key = ${key}`;
    expect((await meDELETE(jsonRequest("/api/me", {}, { method: "DELETE" }))).status).toBe(200);
    const [row] = await getSql()`SELECT user_id, actor_hash FROM reports_private WHERE idempotency_key = ${key}`;
    expect(row.user_id).toBeNull();
    expect(row.actor_hash).not.toBe(hmacHex("user-actor", uid));
    expect(row.actor_hash).toMatch(/^deleted:/);
  });

  it("signing out of a demo account deletes it (it could never be signed back into)", async () => {
    await signIn("Kiara");
    const [{ id }] = await getSql()`SELECT id FROM users WHERE name = 'Kiara' ORDER BY created_at DESC LIMIT 1`;
    expect(await (await signoutPOST(jsonRequest("/api/auth/signout", {}))).json()).toMatchObject({ ok: true, deleted: true });
    expect((await getSql()`SELECT count(*)::int AS n FROM users WHERE id = ${id}`)[0].n).toBe(0);
  });

  it("saving Home again moves it instead of adding a duplicate", async () => {
    await signIn("Lata");
    await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }));
    await placesPOST(jsonRequest("/api/me/places", { label: "home", emoji: "🏠", ...START }));
    const [{ id }] = await getSql()`SELECT id FROM users WHERE name = 'Lata' ORDER BY created_at DESC LIMIT 1`; // this run's Lata
    const rows = await getSql()`SELECT lat FROM saved_places WHERE user_id = ${id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].lat).toBeCloseTo(START.lat, 5);
  });

  it("refuses routes longer than a walk (no huge work for one request)", async () => {
    switchJar(newJar());
    const r = await routePOST(jsonRequest("/api/geo/route", { from: { lat: -80, lon: -170 }, to: { lat: 80, lon: 170 } }));
    expect(r.status).toBe(400);
  });
});
