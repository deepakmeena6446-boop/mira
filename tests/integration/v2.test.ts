import { chosenRecipientIds } from "../helpers/recipient-choice";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetMailer, getMailer } from "@/server/mail";
import { fixedClock, MINUTE } from "@/server/clock";
import { recordHeartbeat } from "@/server/health/worker";
import { addLocation, sharedTrip, ARRIVAL_DWELL_MS, KEEP_POINTS } from "@/server/trips";
import { processJourneys, STALE_AFTER_MS } from "@/server/journey/worker";
import { GET as inboxGET, POST as inboxPOST } from "@/app/api/me/notifications/route";
import { hmacHex } from "@/server/crypto";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { GET as meGET, DELETE as meDELETE } from "@/app/api/me/route";
import { POST as placesPOST } from "@/app/api/me/places/route";
import { POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as acceptPOST } from "@/app/api/invites/accept/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { GET as sharedGET } from "@/app/api/t/[token]/route";
import { POST as miraPOST, GET as miraGET, DELETE as miraDELETE } from "@/app/api/mira/route";
import { POST as routePOST } from "@/app/api/geo/route/route";
import { POST as reportPOST } from "@/app/api/reports/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar, type Jar } from "../helpers/cookie-jar";
import { getRequest, jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const MAILPIT = "http://127.0.0.1:8025/api/v1";
async function mailsTo(to: string) {
  return ((await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as { messages: Array<{ ID: string; Subject: string }> }).messages;
}
async function mailText(id: string) {
  return ((await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string }).Text;
}
const HOME = { lat: 28.6901, lon: 77.2111 }; // Fixture Pharmacy area (test-only grid)
const START = { lat: 28.6927, lon: 77.2131 };

async function signIn(name: string): Promise<Jar> {
  const jar = newJar();
  switchJar(jar);
  const r = await demoPOST(jsonRequest("/api/auth/demo", { name }));
  expect(r.status).toBe(201);
  return jar;
}

async function acceptInviteFor(email: string) {
  const [m] = await mailsTo(email);
  const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(await mailText(m.ID))![1];
  const contactJar = newJar();
  contactJar.set("mira_invite", token);
  switchJar(contactJar);
  expect((await (await acceptPOST(jsonRequest("/api/invites/accept", {}))).json()).status).toBe("accepted");
}

describe("MIRA 2.0 accounts, trips, Mira (placeholders)", () => {
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
    await recordHeartbeat(sql, "v2-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());
  });

  it("demo sign-in creates a real account with places and contacts; delete erases everything", async () => {
    await signIn("Priya Sharma");
    const me = await (await meGET()).json();
    expect(me.user.name).toBe("Priya Sharma");
    expect(me.modes).toMatchObject({ auth: "demo", maps: "placeholder", companion: "placeholder" });
    expect((await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }))).status).toBe(201);
    const email = `mum-${randomUUID().slice(0, 6)}@example.test`;
    const c = await (await contactsPOST(jsonRequest("/api/me/contacts", { name: "Mum", email }))).json();
    expect(c.contact).toMatchObject({ name: "Mum", status: "invited" });
    expect(JSON.stringify(c)).not.toContain(email); // only a masked hint is returned
    const [row] = await getSql()`SELECT encrypted_email FROM contacts WHERE name = 'Mum' ORDER BY created_at DESC LIMIT 1`;
    expect(row.encrypted_email).not.toContain("@");
    expect((await meDELETE(jsonRequest("/api/me", {}, { method: "DELETE" }))).status).toBe(200);
    expect((await (await meGET()).json()).user).toBeNull();
  });

  it("shares a trip with accepted contacts only, streams live points, auto-arrives, then the link goes dark", async () => {
    const owner = await signIn("Asha");
    const accepted = `acc-${randomUUID().slice(0, 6)}@example.test`;
    const pending = `pend-${randomUUID().slice(0, 6)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Riya", email: accepted }));
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Neha", email: pending }));
    await acceptInviteFor(accepted);
    switchJar(owner);

    const res = await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, recipientIds: await chosenRecipientIds() }));
    expect(res.status).toBe(201);
    const { trip } = await res.json();
    expect(trip.sharedWith).toMatchObject([{ name: "Riya", notified: true, viaEmail: true, whatsapp: null, linkDelivery: "sent" }]); // email contact: MIRA emailed; no WhatsApp number
    expect(trip.shareUrl).toMatch(/\/t\/[A-Za-z0-9_-]+$/); // the traveller's own link
    const shareMail = (await mailsTo(accepted)).find((m) => m.Subject.includes("sharing a trip"));
    expect(shareMail).toBeTruthy();
    expect((await mailsTo(pending)).some((m) => m.Subject.includes("sharing a trip"))).toBe(false);
    // Riya's emailed link is hers alone, distinct from the traveller's own link.
    const token = /\/t\/([A-Za-z0-9_-]+)/.exec(await mailText(shareMail!.ID))![1];
    expect(token).not.toBe(trip.shareUrl.split("/t/")[1]);

    // Contact view while open: location + ETA, first name only; she's told she'll get alerts.
    const live = await (await sharedGET(getRequest(`/api/t/${token}`), { params: Promise.resolve({ token }) })).json();
    expect(live).toMatchObject({ state: "active", name: "Asha", destination: "Home", alertsViewer: true });
    expect(live.location).toBeTruthy();

    // Live points are capped; dwelling at the destination auto-arrives.
    const [{ id: userId }] = await getSql()`SELECT user_id AS id FROM journeys WHERE id = ${trip.id}`;
    const clock = fixedClock(new Date());
    for (let i = 0; i < KEEP_POINTS + 5; i++) {
      clock.advance(10_000);
      await addLocation(getSql(), userId, trip.id, { lat: START.lat - i * 0.00001, lon: START.lon }, clock);
    }
    const [{ n }] = await getSql()`SELECT count(*)::int AS n FROM trip_locations WHERE journey_id = ${trip.id}`;
    expect(n).toBe(KEEP_POINTS);
    expect((await addLocation(getSql(), userId, trip.id, HOME, clock)).arrived).toBe(false);
    clock.advance(ARRIVAL_DWELL_MS + 1000);
    expect((await addLocation(getSql(), userId, trip.id, HOME, clock)).arrived).toBe(true);

    const [{ left }] = await getSql()`SELECT count(*)::int AS left FROM trip_locations WHERE journey_id = ${trip.id}`;
    expect(left).toBe(0); // live points never outlive the trip
    const after = await sharedTrip(getSql(), token, new Date());
    expect(after).toEqual({ state: "arrived", name: "Asha" }); // just the good news, briefly
    expect(await sharedTrip(getSql(), token, new Date(Date.now() + 40 * MINUTE))).toBeNull(); // then nothing
  });

  it("alerts shared contacts once when the trip is missed; other users can't touch the trip", async () => {
    const owner = await signIn("Meera");
    const email = `alert-${randomUUID().slice(0, 6)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Didi", email }));
    await acceptInviteFor(email);
    switchJar(owner);
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Hostel" }, recipientIds: await chosenRecipientIds() }))).json();

    await signIn("Stranger");
    const steal = await tripActionPOST(jsonRequest(`/api/trips/${trip.id}/end`, {}), { params: Promise.resolve({ id: trip.id, action: "end" }) });
    expect(steal.status).toBe(404);

    await getSql()`UPDATE journeys SET created_at = now() - interval '40 minutes', eta_at = now() - interval '11 minutes' WHERE id = ${trip.id}`;
    const clock = fixedClock(new Date());
    const tick = await processJourneys(getSql(), clock, getMailer());
    expect(tick).toMatchObject({ missed: 1, alertsSent: 1 });
    await processJourneys(getSql(), fixedClock(new Date(Date.now() + MINUTE)), getMailer());
    const alerts = (await mailsTo(email)).filter((m) => m.Subject.includes("missed"));
    expect(alerts).toHaveLength(1);
    const text = await mailText(alerts[0].ID);
    expect(alerts[0].Subject).toBe("Meera missed their check-in on MIRA");
    expect(text).toMatch(/expected at Hostel about 1\d minutes ago/);
    expect(text).toMatch(/\/t\/[A-Za-z0-9_-]+/); // still-open live link for an accepted contact
    expect(text).not.toMatch(/28\.\d{3}|77\.\d{3}/);
    // The traveller hears about it too, in-app, naming who is being told.
    const [note] = await getSql()`SELECT n.body FROM notifications n JOIN journeys j ON j.user_id = n.user_id WHERE j.id = ${trip.id} AND n.kind = 'trip_missed'`;
    expect(note.body).toMatch(/emailing Didi/);
  });

  it("Mira streams replies with cards, keeps history per user, and can be cleared", async () => {
    await signIn("Kavya");
    await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }));
    const res = await miraPOST(jsonRequest("/api/mira", { message: "take me home", context: { localTime: new Date().toISOString(), tzOffsetMin: -330, location: START } }));
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toMatch(/Home/);
    expect(events.find((e) => e.type === "card")?.card).toMatchObject({ type: "trip", destination: { name: "Home" } });
    expect(events.at(-1)).toEqual({ type: "done" });
    // A movement turn sent with her location is shown, never kept (sprint mira-companion-48h A31).
    expect(res.headers.get("x-mira-history")).toBe("not_saved");
    expect((await (await miraGET()).json()).messages).toEqual([]);
    // A general question without location is kept, and history can be cleared.
    const general = await miraPOST(jsonRequest("/api/mira", { message: "What can you help me with?", context: { localTime: new Date().toISOString(), tzOffsetMin: -330, location: null } }));
    expect(general.headers.get("x-mira-history")).toBe("saved");
    await general.text();
    const hist = await (await miraGET()).json();
    expect(hist.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    await miraDELETE(jsonRequest("/api/mira", {}, { method: "DELETE" }));
    expect((await (await miraGET()).json()).messages).toEqual([]);
    switchJar(newJar());
    // Guests can talk to Mira too (owner decision 2026-10-04): a streamed reply, and nothing is saved.
    const before = (await getSql()`SELECT count(*)::int AS n FROM mira_messages`)[0].n;
    const guest = await miraPOST(jsonRequest("/api/mira", { message: "hi", context: { localTime: new Date().toISOString(), tzOffsetMin: 0, location: null } }));
    expect(guest.status).toBe(200);
    expect((await guest.text()).trim().split("\n").map((l) => JSON.parse(l)).at(-1)).toEqual({ type: "done" });
    expect((await getSql()`SELECT count(*)::int AS n FROM mira_messages`)[0].n).toBe(before);
  });

  it("never stores a first movement turn, a place-context conversation or a coordinate-bearing card (A31)", async () => {
    await signIn("Ishita");
    const ctx = { localTime: new Date().toISOString(), tzOffsetMin: -330 };
    const count = async () => ((await (await miraGET()).json()).messages as unknown[]).length;
    const send = async (body: Record<string, unknown>) => { const r = await miraPOST(jsonRequest("/api/mira", body)); await r.text(); return r.headers.get("x-mira-history"); };
    // First movement sentence: the client's plan state hasn't caught up yet, so it arrives with plan: null.
    expect(await send({ message: "I'm walking to Vishwavidyalaya metro at 10 pm", plan: null, context: { ...ctx, location: null } })).toBe("not_saved");
    // A named-place question started from Around or Home, and its follow-up, carry the ephemeral flag.
    expect(await send({ message: "What should I know before going to Hauz Khas?", ephemeral: true, context: { ...ctx, location: null } })).toBe("not_saved");
    expect(await send({ message: "And what about later tonight?", ephemeral: true, context: { ...ctx, location: null } })).toBe("not_saved");
    // Any turn sent with her position.
    expect(await send({ message: "What's open nearby?", context: { ...ctx, location: START } })).toBe("not_saved");
    expect(await count()).toBe(0);
    // An unrelated question is kept, without coordinates.
    expect(await send({ message: "How do I add someone to my Circle?", context: { ...ctx, location: null } })).toBe("saved");
    expect(await count()).toBe(2);
    const stored = JSON.stringify((await (await miraGET()).json()).messages);
    expect(stored).not.toMatch(/28\.\d{3}|77\.\d{3}|"lat"|"lon"/);
    // The flag is validated: only `true` is accepted.
    const bad = await miraPOST(jsonRequest("/api/mira", { message: "hi", ephemeral: "yes", context: { ...ctx, location: null } }));
    expect(bad.status).toBe(400);
  });

  it("works worldwide: honest approximate routes and geohash reports anywhere", async () => {
    switchJar(newJar());
    const r = await (await routePOST(jsonRequest("/api/geo/route", { from: { lat: 51.5007, lon: -0.1246 }, to: { lat: 51.5033, lon: -0.1196 } }))).json();
    expect(r.route.approximate).toBe(true);
    expect(r.route.geometry).toHaveLength(2);
    expect(r.route.minutes).toBeGreaterThan(0);
    const g = await (await routePOST(jsonRequest("/api/geo/route", { from: START, to: HOME }))).json();
    expect(g.route.approximate).toBe(false);
    const rep = await reportPOST(jsonRequest("/api/reports", { idempotencyKey: randomUUID(), involvement: "witnessed", category: "environment", location: { lat: 51.5007, lon: -0.1246 }, recency: "today", timeBand: "late" }));
    expect(rep.status).toBe(201);
    const [row] = await getSql()`SELECT count(*)::int AS n FROM reports_private WHERE coarse_cell_id LIKE 'gcpu%'`;
    expect(row.n).toBeGreaterThanOrEqual(1);
  });

  it("signing in claims this browser's anonymous reports, re-keyed to the account, and forgets the anonymous cookie", async () => {
    const jar = newJar();
    switchJar(jar);
    const key = randomUUID();
    const sent = await reportPOST(jsonRequest("/api/reports", { idempotencyKey: key, involvement: "witnessed", category: "environment", location: START, recency: "today", timeBand: "day" }));
    expect(sent.status).toBe(201);
    expect(jar.has("mira_actor")).toBe(true);
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Tanvi" }))).status).toBe(201);
    const [row] = await getSql()`SELECT r.user_id, r.actor_hash, u.id AS uid FROM reports_private r JOIN users u ON u.id = r.user_id WHERE r.idempotency_key = ${key}`;
    expect(row.user_id).toBe(row.uid);
    expect(row.actor_hash).toBe(hmacHex("user-actor", row.uid)); // one person = one contributor
    expect(jar.has("mira_actor")).toBe(false);
    const inbox = await (await inboxGET()).json();
    expect(inbox.notifications[0]).toMatchObject({ kind: "welcome", title: "Welcome to MIRA, Tanvi" });
    expect(inbox.notifications[0].body).toMatch(/report you sent before signing in is now linked/);
    // Opening the inbox marks everything read.
    await inboxPOST(jsonRequest("/api/me/notifications", {}));
    expect((await (await inboxGET()).json()).notifications.every((n: { read_at: string | null }) => n.read_at)).toBe(true);
  });

  it("tells the owner once when a contact accepts", async () => {
    await signIn("Ira");
    const email = `acc2-${randomUUID().slice(0, 6)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Zara", email }));
    await acceptInviteFor(email);
    const [{ uid }] = await getSql()`SELECT user_id AS uid FROM contacts WHERE name = 'Zara' ORDER BY created_at DESC LIMIT 1`;
    const notes = await getSql()`SELECT title FROM notifications WHERE user_id = ${uid} AND kind = 'contact_accepted'`;
    expect(notes.map((n) => n.title)).toEqual(["Zara accepted your invite"]);
  });

  it("nudges the owner once when live location pauses, and again after it resumes and pauses", async () => {
    await signIn("Diya");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false }))).json();
    const [{ user_id: uid }] = await getSql()`SELECT user_id FROM journeys WHERE id = ${trip.id}`;
    await getSql()`UPDATE journeys SET eta_at = now() + interval '1 hour' WHERE id = ${trip.id}`; // pauses happen well before the ETA
    const pause = () => getSql()`UPDATE journeys SET last_location_at = now() - ${`${STALE_AFTER_MS / 1000 + 60} seconds`}::interval WHERE id = ${trip.id}`;
    const count = async () => (await getSql()`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${uid} AND kind = 'location_paused'`)[0].n;

    await pause();
    expect((await processJourneys(getSql(), fixedClock(new Date()), getMailer())).staleNudged).toBe(1);
    expect((await processJourneys(getSql(), fixedClock(new Date()), getMailer())).staleNudged).toBe(0); // once per pause
    expect(await count()).toBe(1);

    const resumed = new Date(Date.now() + 1000);
    await addLocation(getSql(), uid, trip.id, START, fixedClock(resumed)); // points resume…
    expect((await processJourneys(getSql(), fixedClock(new Date(resumed.getTime() + 60_000)), getMailer())).staleNudged).toBe(0);
    // …then stop again: another nudge once the new pause is long enough (still before the ETA).
    await processJourneys(getSql(), fixedClock(new Date(resumed.getTime() + STALE_AFTER_MS + 60_000)), getMailer());
    expect(await count()).toBe(2);
  });
});

