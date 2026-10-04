import { chosenRecipientIds } from "../helpers/recipient-choice";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetMailer } from "@/server/mail";
import { fixedClock, MINUTE } from "@/server/clock";
import { recordHeartbeat } from "@/server/health/worker";
import { addLocation, sharedTrip, tripsOverview, ARRIVAL_DWELL_MS } from "@/server/trips";
import { purgeExpired } from "@/server/retention";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { DELETE as meDELETE } from "@/app/api/me/route";
import { POST as placesPOST } from "@/app/api/me/places/route";
import { POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as acceptPOST } from "@/app/api/invites/accept/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { GET as sharedGET } from "@/app/api/t/[token]/route";
import { GET as prefsGET, PATCH as prefsPATCH } from "@/app/api/me/prefs/route";
import { GET as habitsGET, DELETE as habitsDELETE } from "@/app/api/me/habits/route";
import { GET as suggestionGET } from "@/app/api/me/habits/suggestion/route";
import { POST as miraPOST } from "@/app/api/mira/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar, type Jar } from "../helpers/cookie-jar";
import { allKeys, getRequest, jsonRequest } from "../helpers/http";
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
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
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

async function saveHome(): Promise<string> {
  const r = await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }));
  expect(r.status).toBe(201);
  return (await r.json()).place.id;
}

async function start(body: Record<string, unknown>) {
  return tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, recipientIds: body.share === false ? [] : await chosenRecipientIds(), ...body }));
}

const action = (id: string, a: string) => tripActionPOST(jsonRequest(`/api/trips/${id}/${a}`, {}), { params: Promise.resolve({ id, action: a }) });

async function userIdOf(tripId: string): Promise<string> {
  return (await getSql()<{ user_id: string }[]>`SELECT user_id FROM journeys WHERE id = ${tripId}`)[0].user_id;
}

async function habitsOf(userId: string) {
  return getSql()<{ place_id: string; mode: string; start_hour: number; times: number; last_shared_with: string[] }[]>`
    SELECT place_id, mode, start_hour, times, last_shared_with FROM journey_habits WHERE user_id = ${userId}`;
}

describe("Journey companion: time zones, habits, Trips", () => {
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
    await recordHeartbeat(sql, "companion-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());
  });

  it("pauses legacy habit use until an explicit choice while preserving review and deletion", async () => {
    await signIn("Legacy");
    const placeId = await saveHome();
    const trip = (await (await start({ tz: "UTC", savedPlaceId: placeId, startHour: 8, share: false })).json()).trip;
    const userId = await userIdOf(trip.id);
    const sql = getSql();
    const [initial] = await sql<{ remember_habits: boolean; legacy_remember_habits: boolean }[]>`
      SELECT remember_habits, legacy_remember_habits FROM users WHERE id = ${userId}`;
    expect(initial).toEqual({ remember_habits: false, legacy_remember_habits: false });

    // Simulate a row retained by the forward migration from the old default-on setting.
    await sql`UPDATE users SET legacy_remember_habits = true WHERE id = ${userId}`;
    await sql`INSERT INTO journey_habits (user_id, place_id, mode, start_hour, times) VALUES (${userId}, ${placeId}, 'walk', 8, 3)`;
    expect((await (await prefsGET()).json()).pausedLegacyHabits).toBe(true);
    expect((await (await habitsGET()).json()).habits).toHaveLength(1);
    expect((await (await suggestionGET(getRequest("/api/me/habits/suggestion?hour=8"))).json()).suggestion).toBeNull();
    await action(trip.id, "arrive");
    expect((await habitsOf(userId))[0].times).toBe(3);

    const enabled = await (await prefsPATCH(jsonRequest("/api/me/prefs", { rememberHabits: true }, { method: "PATCH" }))).json();
    expect(enabled).toMatchObject({ rememberHabits: true, pausedLegacyHabits: false });
    expect((await (await suggestionGET(getRequest("/api/me/habits/suggestion?hour=8"))).json()).suggestion).toMatchObject({ placeId });
    await prefsPATCH(jsonRequest("/api/me/prefs", { rememberHabits: false }, { method: "PATCH" }));
    expect(await habitsOf(userId)).toHaveLength(0);
  });

  it("starts a trip with the phone's time zone, a saved place and the local start hour", async () => {
    await signIn("Nora");
    const placeId = await saveHome();
    const res = await start({ tz: "America/New_York", savedPlaceId: placeId, startHour: 21, share: false });
    expect(res.status).toBe(201);
    const { trip } = await res.json();
    expect(trip.tz).toBe("America/New_York");
    const [row] = await getSql()`SELECT tz, saved_place_id, start_hour FROM journeys WHERE id = ${trip.id}`;
    expect(row).toEqual({ tz: "America/New_York", saved_place_id: placeId, start_hour: 21 });
  });

  it("derives the start hour from the zone, drops an unknown zone, and never blocks the journey for it", async () => {
    await signIn("Lena");
    const a = await (await start({ tz: "Asia/Dubai", share: false })).json();
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    const [row] = await getSql()`SELECT tz, start_hour, saved_place_id FROM journeys WHERE id = ${a.trip.id}`;
    expect(row.tz).toBe("Asia/Dubai");
    expect([hour, (hour + 1) % 24]).toContain(row.start_hour); // (the test may straddle an hour boundary)
    expect(row.saved_place_id).toBeNull();
    await action(a.trip.id, "end");

    const b = await start({ tz: "Mars/Olympus_Mons", share: false });
    expect(b.status).toBe(201);
    const [rowB] = await getSql()`SELECT tz, start_hour FROM journeys WHERE id = ${(await b.json()).trip.id}`;
    expect(rowB).toEqual({ tz: null, start_hour: null });
  });

  it("rejects someone else's saved place; a place deleted meanwhile just isn't linked", async () => {
    await signIn("Owner One");
    const theirs = await saveHome();
    await signIn("Owner Two");
    const res = await start({ savedPlaceId: theirs, tz: "Europe/London", share: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("unknown_saved_place");
    expect((await getSql()`SELECT count(*)::int AS n FROM journeys`)[0].n).toBe(0);

    const gone = await start({ savedPlaceId: randomUUID(), tz: "Europe/London", share: false });
    expect(gone.status).toBe(201);
    const [row] = await getSql()`SELECT saved_place_id FROM journeys WHERE id = ${(await gone.json()).trip.id}`;
    expect(row.saved_place_id).toBeNull();
  });

  it("arriving at a saved place counts a habit (manual and auto-arrival); other trips count nothing", async () => {
    const owner = await signIn("Priya Nair");
    const placeId = await saveHome();
    expect((await (await prefsGET()).json()).rememberHabits).toBe(false);
    expect((await prefsPATCH(jsonRequest("/api/me/prefs", { rememberHabits: true }, { method: "PATCH" }))).status).toBe(200);
    const email = `habit-${randomUUID().slice(0, 6)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Asha", email }));
    await acceptInviteFor(email);
    switchJar(owner);
    const [{ id: contactId }] = await getSql()`SELECT id FROM contacts WHERE name = 'Asha' ORDER BY created_at DESC LIMIT 1`;

    // 1. Manual "I'm here".
    const t1 = (await (await start({ tz: "Europe/London", savedPlaceId: placeId, startHour: 21 })).json()).trip;
    const userId = await userIdOf(t1.id);
    expect((await action(t1.id, "arrive")).status).toBe(200);
    expect(await habitsOf(userId)).toEqual([{ place_id: placeId, mode: "walk", start_hour: 21, times: 1, last_shared_with: [contactId] }]);

    // 2. Auto-arrival (dwelling at the destination) counts the same habit again.
    const t2 = (await (await start({ tz: "Europe/London", savedPlaceId: placeId, startHour: 21, share: false })).json()).trip;
    const clock = fixedClock(new Date());
    await addLocation(getSql(), userId, t2.id, HOME, clock);
    clock.advance(ARRIVAL_DWELL_MS + 1000);
    expect((await addLocation(getSql(), userId, t2.id, HOME, clock)).arrived).toBe(true);
    const [h] = await habitsOf(userId);
    expect(h.times).toBe(2);
    expect(h.last_shared_with).toEqual([]); // the last one wasn't shared

    // 3. Ended (not arrived), or to a place that isn't saved: nothing.
    const t3 = (await (await start({ tz: "Europe/London", savedPlaceId: placeId, startHour: 21, share: false })).json()).trip;
    await action(t3.id, "end");
    const t4 = (await (await start({ tz: "Europe/London", startHour: 21, share: false })).json()).trip;
    await action(t4.id, "arrive");
    expect((await habitsOf(userId)).map((x) => x.times)).toEqual([2]);

    // 4. Me → What MIRA remembers, in words.
    const listed = await (await habitsGET()).json();
    expect(listed.rememberHabits).toBe(true);
    expect(listed.habits).toEqual([expect.objectContaining({ placeId, placeLabel: "Home", mode: "walk", startHour: 21, times: 2, text: "Home · walking · around 9 pm · 2 times" })]);
    expect(JSON.stringify(listed)).not.toMatch(/28\.\d|77\.\d/); // no coordinates

    // 5. A third journey makes a suggestion around 9 pm (±1 h), naming Asha from last time she shared.
    const t5 = (await (await start({ tz: "Europe/London", savedPlaceId: placeId, startHour: 21 })).json()).trip;
    await action(t5.id, "arrive");
    const sug = async (q: string) => (await (await suggestionGET(getRequest(`/api/me/habits/suggestion${q}`))).json()).suggestion;
    expect(await sug("?hour=21")).toMatchObject({ placeId, placeLabel: "Home", mode: "walk", times: 3, shareWith: [{ id: contactId, name: "Asha" }] });
    expect((await sug("?hour=21")).text).toBe("You're heading to Home around your usual time. Share this journey with Asha like usual?");
    expect(await sug("?hour=22")).toMatchObject({ placeId, times: 3 }); // within an hour of 9 pm
    expect(await sug("?hour=23")).toBeNull();
    expect(await sug("?hour=15")).toBeNull();
    expect(await sug("?hour=21&mode=transit")).toBeNull();
    expect(await sug("")).toBeNull(); // no local hour: no honest "usual time"
  });

  it("learning off records nothing and forgets everything; Forget all deletes; account deletion cascades", async () => {
    await signIn("Sara");
    const placeId = await saveHome();
    await prefsPATCH(jsonRequest("/api/me/prefs", { rememberHabits: true }, { method: "PATCH" }));
    const t1 = (await (await start({ tz: "Asia/Tokyo", savedPlaceId: placeId, startHour: 8, share: false })).json()).trip;
    const userId = await userIdOf(t1.id);
    await action(t1.id, "arrive");
    expect(await habitsOf(userId)).toHaveLength(1);

    // Forget all.
    expect((await (await habitsDELETE(jsonRequest("/api/me/habits", {}, { method: "DELETE" }))).json()).forgotten).toBe(1);
    expect(await habitsOf(userId)).toHaveLength(0);

    // Learning off: switching it off forgets, and new arrivals record nothing.
    const t2 = (await (await start({ tz: "Asia/Tokyo", savedPlaceId: placeId, startHour: 8, share: false })).json()).trip;
    await action(t2.id, "arrive");
    expect(await habitsOf(userId)).toHaveLength(1);
    const off = await prefsPATCH(jsonRequest("/api/me/prefs", { rememberHabits: false }, { method: "PATCH" }));
    expect(await off.json()).toMatchObject({ rememberHabits: false });
    expect(await habitsOf(userId)).toHaveLength(0);
    const t3 = (await (await start({ tz: "Asia/Tokyo", savedPlaceId: placeId, startHour: 8, share: false })).json()).trip;
    await action(t3.id, "arrive");
    expect(await habitsOf(userId)).toHaveLength(0);
    expect((await (await suggestionGET(getRequest("/api/me/habits/suggestion?hour=8"))).json()).suggestion).toBeNull();

    // Travel preferences: explicit, validated, clearable.
    const p = await (await prefsPATCH(jsonRequest("/api/me/prefs", { mode: "transit", shareByDefault: true }, { method: "PATCH" }))).json();
    expect(p).toMatchObject({ prefs: { mode: "transit", shareByDefault: true }, rememberHabits: false, helpExclude: [] });
    expect((await prefsPATCH(jsonRequest("/api/me/prefs", { mode: "teleport" }, { method: "PATCH" }))).status).toBe(400);
    expect((await prefsPATCH(jsonRequest("/api/me/prefs", { avoid: ["police"] }, { method: "PATCH" }))).status).toBe(400);
    await prefsPATCH(jsonRequest("/api/me/prefs", { mode: null, rememberHabits: true }, { method: "PATCH" }));
    expect(await (await prefsGET()).json()).toEqual({ prefs: { shareByDefault: true }, rememberHabits: true, pausedLegacyHabits: false, helpExclude: [] });

    // Account deletion cascades to habits (FK ON DELETE CASCADE).
    const t4 = (await (await start({ tz: "Asia/Tokyo", savedPlaceId: placeId, startHour: 8, share: false })).json()).trip;
    await action(t4.id, "arrive");
    expect(await habitsOf(userId)).toHaveLength(1);
    expect((await meDELETE(jsonRequest("/api/me", {}, { method: "DELETE" }))).status).toBe(200);
    expect(await habitsOf(userId)).toHaveLength(0);
    const fks = await getSql()<{ confdeltype: string }[]>`SELECT confdeltype FROM pg_constraint WHERE conrelid = 'journey_habits'::regclass AND contype = 'f'`;
    expect(fks.map((f) => f.confdeltype)).toEqual(["c", "c"]); // user and saved place
  });

  it("deleting a saved place deletes its habits; retention drops habits unused for 400 days", async () => {
    await signIn("Maya");
    const placeId = await saveHome();
    await prefsPATCH(jsonRequest("/api/me/prefs", { rememberHabits: true }, { method: "PATCH" }));
    const t = (await (await start({ tz: "UTC", savedPlaceId: placeId, startHour: 7, share: false })).json()).trip;
    const userId = await userIdOf(t.id);
    await action(t.id, "arrive");
    await getSql()`UPDATE journey_habits SET last_day = current_date - 401 WHERE user_id = ${userId}`;
    const counts = await purgeExpired(getSql(), new Date());
    expect(counts.habits).toBeGreaterThanOrEqual(1);
    expect(await habitsOf(userId)).toHaveLength(0);

    const t2 = (await (await start({ tz: "UTC", savedPlaceId: placeId, startHour: 7, share: false })).json()).trip;
    await action(t2.id, "arrive");
    expect(await habitsOf(userId)).toHaveLength(1);
    await getSql()`DELETE FROM saved_places WHERE id = ${placeId}`;
    expect(await habitsOf(userId)).toHaveLength(0);
  });

  it("contact emails show the ETA in the traveller's zone, labelled; the live view needs no cookies and exposes only allowed fields", async () => {
    const owner = await signIn("Emma Stone");
    const email = `tz-${randomUUID().slice(0, 6)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Jo", email }));
    await acceptInviteFor(email);
    switchJar(owner);
    const { trip } = await (await start({ tz: "America/New_York", mode: "transit", etaMinutes: 40 })).json();
    const mail = (await mailsTo(email)).find((m) => m.Subject.includes("sharing a trip"))!;
    const text = await mailText(mail.ID);
    expect(text).toMatch(/is on the way by transit to Home/);
    expect(text).toMatch(/around \d{1,2}:\d{2} [AP]M E[DS]T, their time/);
    expect(text).not.toMatch(/IST|auto or cab|metro or bus/);
    const token = /\/t\/([A-Za-z0-9_-]+)/.exec(text)![1];

    switchJar(newJar()); // a viewer with no account and no cookies
    const res = await sharedGET(getRequest(`/api/t/${token}`), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const live = await res.json();
    expect(live).toMatchObject({ state: "active", name: "Emma", destination: "Home", mode: "transit", tz: "America/New_York", alertsViewer: true });
    const allowed = new Set(["state", "name", "destination", "dest", "lat", "lon", "etaAt", "tz", "alertsViewer", "mode", "checkRequested", "location", "at", "ageSeconds"]);
    for (const k of allKeys(live)) expect(allowed.has(k), k).toBe(true);
    expect(JSON.stringify(live)).not.toMatch(/Stone|@example|token/);

    switchJar(owner);
    await action(trip.id, "arrive");
    expect(await sharedTrip(getSql(), token, new Date())).toEqual({ state: "arrived", name: "Emma" });
    expect(await sharedTrip(getSql(), token, new Date(Date.now() + 40 * MINUTE))).toBeNull();
  });

  it("Mira's trip card and reply say what email can do: an attempt when it's on, do-it-yourself when it's off", async () => {
    const owner = await signIn("Ines");
    await saveHome();
    const email = `mira-${randomUUID().slice(0, 6)}@example.test`;
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Asha", email }));
    await acceptInviteFor(email);
    switchJar(owner);
    const ask = async () => {
      const res = await miraPOST(jsonRequest("/api/mira", { message: "take me home", context: { localTime: new Date().toISOString(), tzOffsetMin: 0, location: START } }));
      expect(res.status).toBe(200);
      const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; delta?: string; card?: { type: string; email?: boolean } });
      return { text: events.filter((e) => e.type === "text").map((e) => e.delta).join(""), card: events.find((e) => e.card?.type === "trip")?.card };
    };
    const on = await ask();
    expect(on.text).toMatch(/MIRA will try to email Asha your live link when you start \(sending can fail\)\./);
    expect(on.card).toMatchObject({ type: "trip", contacts: ["Asha"], email: true });
    const smtp = process.env.SMTP_HOST;
    try {
      delete process.env.SMTP_HOST; // no email provider (applyTestEnv would rotate the session secret)
      resetEnvCache();
      const off = await ask();
      expect(off.text).toMatch(/Email isn't switched on, so share your live link yourself after you start\./);
      expect(off.text).not.toMatch(/follow along live|will be able to/);
      expect(off.card).toMatchObject({ type: "trip", email: false });
    } finally {
      process.env.SMTP_HOST = smtp;
      resetEnvCache();
      resetMailer();
    }
  });

  it("Trips lists the open journey first, then journeys finished in the last day only", async () => {
    await signIn("Tara");
    const done = (await (await start({ tz: "Europe/London", share: false })).json()).trip;
    const userId = await userIdOf(done.id);
    await action(done.id, "arrive");
    const old = (await (await start({ tz: "Europe/London", share: false })).json()).trip;
    await action(old.id, "end");
    // Finished over a day ago (not yet purged by the worker): not listed.
    await getSql()`UPDATE journeys SET closed_at = now() - interval '25 hours', purge_at = now() - interval '1 hour' WHERE id = ${old.id}`; // (purge_at ≤ closed_at + 24 h is a DB constraint)
    const gone = (await (await start({ tz: "Europe/London", share: false })).json()).trip;
    await action(gone.id, "end");
    await getSql()`UPDATE journeys SET purge_at = now() - interval '1 minute' WHERE id = ${gone.id}`; // past its purge time
    const open = (await (await start({ tz: "Europe/London", mode: "ride", etaMinutes: 20, share: false })).json()).trip;

    const o = await tripsOverview(getSql(), userId, new Date());
    expect(o.active).toMatchObject({ id: open.id, state: "active", mode: "ride", tz: "Europe/London" });
    expect(o.recent.map((r) => r.id)).toEqual([done.id]);
    expect(o.recent[0]).toMatchObject({ state: "arrived", destination: "Home", tz: "Europe/London", sharedWith: [] });
    expect(JSON.stringify(o.recent)).not.toMatch(/"lat"|"lon"/);

    // Someone else sees none of it.
    await signIn("Other");
    const [{ id: otherId }] = await getSql()`SELECT id FROM users WHERE name = 'Other' ORDER BY created_at DESC LIMIT 1`;
    expect(await tripsOverview(getSql(), otherId, new Date())).toEqual({ active: null, recent: [] });
  });
});
