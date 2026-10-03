import { chosenRecipientIds } from "../helpers/recipient-choice";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetMailer } from "@/server/mail";
import { recordHeartbeat } from "@/server/health/worker";
import { systemClock } from "@/server/clock";
import { addLocation, ARRIVAL_DWELL_MS } from "@/server/trips";
import { encryptLegacyPlaces, listPlaces } from "@/server/account/places";
import { localeFor } from "@/server/locale";
import { drainPushOutbox, saveSubscription, type PushSender } from "@/server/providers/notify/push";
import { purgeExpired } from "@/server/retention";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as signoutPOST } from "@/app/api/auth/signout/route";
import { POST as emailPOST } from "@/app/api/auth/email/route";
import { POST as confirmPOST } from "@/app/api/auth/email/confirm/route";
import { GET as meGET, PATCH as mePATCH } from "@/app/api/me/route";
import { POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as acceptPOST } from "@/app/api/invites/accept/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { GET as sharedGET } from "@/app/api/t/[token]/route";
import { POST as reversePOST } from "@/app/api/geo/reverse/route";
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
const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const HOME = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };

async function signIn(name: string): Promise<Jar> {
  const jar = newJar();
  switchJar(jar);
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
  return jar;
}
const action = (id: string, a: string) => tripActionPOST(jsonRequest(`/api/trips/${id}/${a}`, {}), { params: Promise.resolve({ id, action: a }) });

/** The sign-in link from the newest email to `to`, used the way a phone would: link → cookie → tap. */
async function useSignInLink(to: string, jar: Jar) {
  const [m] = await mailsTo(to);
  const token = /\/auth\/link\/([A-Za-z0-9_-]+)/.exec(await mailText(m.ID))?.[1];
  expect(token).toBeTruthy();
  jar.set("mira_signin", token!);
  switchJar(jar);
  return confirmPOST(jsonRequest("/api/auth/email/confirm", {}));
}

describe("P1: durable accounts, journeys, check-on-me, push, Location Context", () => {
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
    await getSql()`DELETE FROM abuse_counters`;
    await recordHeartbeat(getSql(), "p1-worker", new Date(), "test", new Date());
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
  });

  it("email sign-in: add an email to keep the account, sign out safely, sign back in on a new phone", async () => {
    const email = unique("esha");
    const jar = await signIn("Esha");
    expect((await emailPOST(jsonRequest("/api/auth/email", { email }))).status).toBe(200);
    const added = await useSignInLink(email, jar);
    expect(await added.json()).toEqual({ ok: true, added: true });
    const me = await (await meGET()).json();
    expect(me.user.durable).toBe(true);
    // Stored encrypted + keyed hash only; the legacy plaintext column stays empty.
    const [row] = await getSql()`SELECT email, email_enc, email_hash FROM users WHERE id = ${me.user.id}`;
    expect(row.email).toBeNull();
    expect(String(row.email_enc)).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain(email);
    // Signing out no longer deletes a durable account…
    expect(await (await signoutPOST(jsonRequest("/api/auth/signout", {}))).json()).toMatchObject({ deleted: false });
    // …and a new phone gets back in with a link.
    const phone = newJar();
    switchJar(phone);
    expect((await emailPOST(jsonRequest("/api/auth/email", { email }))).status).toBe(200);
    expect(await (await useSignInLink(email, phone)).json()).toEqual({ ok: true, added: false });
    expect((await (await meGET()).json()).user).toMatchObject({ id: me.user.id, name: "Esha" });
    // A link works once.
    const again = await useSignInLink(email, phone);
    expect(again.status).toBe(410);
  });

  it("an 'add this email' link completes only for the account that asked — never files someone's address under a stranger's account", async () => {
    const email = unique("victim");
    const attacker = await signIn("Mallory");
    const { user: before } = await (await meGET()).json();
    expect((await emailPOST(jsonRequest("/api/auth/email", { email }))).status).toBe(200); // asked from the attacker's account
    const victim = newJar(); // the owner of the inbox taps it in their own browser
    const r = await useSignInLink(email, victim);
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("link_other_account");
    const [row] = await getSql()`SELECT email_hash FROM users WHERE id = ${before.id}`;
    expect(row.email_hash).toBeNull(); // the address was not attached
    switchJar(attacker);
    expect((await (await meGET()).json()).user.durable).toBe(false);
  });

  it("an unknown address gets an honest 'no account' email, and the response doesn't reveal it", async () => {
    const email = unique("nobody");
    switchJar(newJar());
    const r = await emailPOST(jsonRequest("/api/auth/email", { email }));
    expect(await r.json()).toEqual({ ok: true });
    const [m] = await mailsTo(email);
    expect(m.Subject).toBe("Signing in to MIRA");
    expect(await mailText(m.ID)).not.toMatch(/\/auth\/link\//);
  });

  it("saved places written before encryption are converted by the worker", async () => {
    await signIn("Legacy");
    const { user } = await (await meGET()).json();
    await getSql()`INSERT INTO saved_places (user_id, label, emoji, lat, lon, address) VALUES (${user.id}, 'Home', '🏠', ${HOME.lat}, ${HOME.lon}, 'Old address')`;
    expect(await encryptLegacyPlaces(getSql())).toBeGreaterThanOrEqual(1);
    const [raw] = await getSql()`SELECT lat, address, place_enc FROM saved_places WHERE user_id = ${user.id}`;
    expect(raw).toMatchObject({ lat: null, address: null });
    const [place] = await listPlaces(getSql(), user.id);
    expect(place).toMatchObject({ label: "Home", address: "Old address" });
    expect(place.lat).toBeCloseTo(HOME.lat, 5);
  });

  it("non-walking journeys use her ETA (and may go further than a walk); 'share where I am' never auto-arrives", async () => {
    await signIn("Rider");
    const now = Date.now();
    const far = { lat: 28.4595, lon: 77.0266, name: "Office" }; // ~30 km: too far to walk
    const ride = await tripsPOST(jsonRequest("/api/trips", { from: START, to: far, share: false, mode: "ride", etaMinutes: 40 }));
    expect(ride.status).toBe(201);
    const { trip } = await ride.json();
    expect(trip.mode).toBe("ride");
    expect(Math.abs(new Date(trip.etaAt).getTime() - (now + 40 * 60_000))).toBeLessThan(5_000);
    await action(trip.id, "end");
    expect((await tripsPOST(jsonRequest("/api/trips", { from: START, to: far, share: false, mode: "walk" }))).status).toBe(400); // too far on foot

    const here = await (await tripsPOST(jsonRequest("/api/trips", { from: START, share: false, etaMinutes: 30 }))).json();
    expect(here.trip).toMatchObject({ autoArrival: false, destination: { name: "Where I am" } });
    const { user } = await (await meGET()).json();
    const t0 = systemClock.now().getTime();
    await addLocation(getSql(), user.id, here.trip.id, { ...START, accuracy: 10 }, { now: () => new Date(t0) });
    const r = await addLocation(getSql(), user.id, here.trip.id, { ...START, accuracy: 10 }, { now: () => new Date(t0 + ARRIVAL_DWELL_MS + 1000) });
    expect(r.arrived).toBe(false); // standing where she started is not "arriving"
    await action(here.trip.id, "end");
  });

  it("Tell my people now emails accepted contacts with their live link (even on a private journey), once per few minutes", async () => {
    const email = unique("mum");
    const owner = await signIn("Kavya");
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Mum", email }));
    const [invite] = await mailsTo(email);
    const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(await mailText(invite.ID))![1];
    const c = newJar();
    c.set("mira_invite", token);
    switchJar(c);
    await acceptPOST(jsonRequest("/api/invites/accept", {}));
    switchJar(owner);
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false }))).json();
    expect(trip.sharedWith).toEqual([]);
    const r = await (await tripActionPOST(jsonRequest(`/api/trips/${trip.id}/checkon`, { recipientIds: await chosenRecipientIds() }), { params: Promise.resolve({ id: trip.id, action: "checkon" }) })).json();
    expect(r).toMatchObject({ told: ["Mum"], failed: [] });
    expect(r.trip.checkRequestedAt).toBeTruthy();
    const mail = (await mailsTo(email)).find((m) => m.Subject.includes("asked you to check on them"))!;
    const text = await mailText(mail.ID);
    expect(text).toMatch(/not an emergency service/);
    const live = /\/t\/([A-Za-z0-9_-]+)/.exec(text)![1];
    switchJar(newJar());
    const view = await (await sharedGET(getRequest(`/api/t/${live}`), { params: Promise.resolve({ token: live }) })).json();
    expect(view).toMatchObject({ state: "active", checkRequested: true, mode: "walk" });
    switchJar(owner);
    expect((await action(trip.id, "checkon")).status).toBe(429);
    await action(trip.id, "end");
  });

  it("push: each new traveller update is pushed once; dead subscriptions are removed", async () => {
    await signIn("Pushy");
    const { user } = await (await meGET()).json();
    await saveSubscription(getSql(), user.id, { endpoint: `https://push.example.test/${Date.now()}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });
    await getSql()`INSERT INTO notifications (user_id, kind, title, body, href) VALUES (${user.id}, 'trip_missed', 'You missed your check-in', 'Tap I''m here if you''ve arrived.', '/trip')`;
    await getSql()`INSERT INTO notifications (user_id, kind, title, body) VALUES (${user.id}, 'welcome', 'Welcome', 'Not pushed')`;
    const sent: string[] = [];
    const ok: PushSender = async (_s, payload) => (sent.push(payload), 201);
    expect(await drainPushOutbox(getSql(), ok, new Date())).toMatchObject({ pushed: 1 });
    expect(JSON.parse(sent[0])).toEqual({ title: "You missed your check-in", body: "Tap I'm here if you've arrived.", href: "/trip", tag: "trip_missed" });
    expect(await drainPushOutbox(getSql(), ok, new Date())).toMatchObject({ pushed: 0 }); // once only
    await getSql()`INSERT INTO notifications (user_id, kind, title, body) VALUES (${user.id}, 'location_paused', 'Paused', 'x')`;
    expect(await drainPushOutbox(getSql(), async () => 410, new Date())).toMatchObject({ removed: 1 });
    expect((await getSql()`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = ${user.id}`)[0].n).toBe(0);
  });

  it("Location Context: the cited profile gives the emergency number and helplines where they operate", async () => {
    switchJar(newJar());
    const r = await (await reversePOST(jsonRequest("/api/geo/reverse", HOME))).json();
    expect(r.country).toMatchObject({ iso: "IN", emergency: { primary: { number: "112" } }, timezone: "Asia/Kolkata" });
    expect(r.country.helplines.map((h: { number: string }) => h.number)).toContain("181");
    expect(localeFor("IN", "IN-WB").helplines.map((h) => h.number)).not.toContain("181"); // WCD: not operational in West Bengal
    // No profile for a country: MIRA says it doesn't know the number (never India's 112 by default).
    expect(localeFor("AQ")).toMatchObject({ iso: "AQ", emergency: { primary: null, also: [], services: [] }, helplines: [] });
    expect(localeFor(null).emergency.primary).toBeNull();
  });

  it("Help Point filters are saved with the account, and inactive durable accounts are eventually deleted", async () => {
    await signIn("Filter");
    expect((await mePATCH(jsonRequest("/api/me", { helpExclude: ["police"] }, { method: "PATCH" }))).status).toBe(200);
    const { user } = await (await meGET()).json();
    expect(user.helpExclude).toEqual(["police"]);
    expect((await mePATCH(jsonRequest("/api/me", { helpExclude: ["nightclub"] }, { method: "PATCH" }))).status).toBe(400);
    await getSql()`UPDATE users SET email_hash = ${`test-${user.id}`}, last_active_at = now() - interval '401 days' WHERE id = ${user.id}`;
    const counts = await purgeExpired(getSql(), new Date());
    expect(counts.inactiveAccounts).toBeGreaterThanOrEqual(1);
    expect((await getSql()`SELECT count(*)::int AS n FROM users WHERE id = ${user.id}`)[0].n).toBe(0);
  });
});
