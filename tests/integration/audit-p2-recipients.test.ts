import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);
vi.mock("@/server/providers/notify", async (original) => ({ ...await original<object>(), emailContact: vi.fn(async () => ({ ok: true })) }));

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { systemClock } from "@/server/clock";
import { hmacHex } from "@/server/crypto";
import { recordHeartbeat } from "@/server/health/worker";
import { emailContact } from "@/server/providers/notify";
import { processJourneys } from "@/server/journey/worker";
import { acceptContactInvite, INVITE_RECIPIENT_LIMIT } from "@/server/account/contacts";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { GET as contactsGET, POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as actionPOST } from "@/app/api/trips/[id]/[action]/route";
import { POST as stopPOST } from "@/app/api/invites/stop/route";
import { POST as reportPOST } from "@/app/api/reports/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const from = { lat: 28.6927, lon: 77.2131 };
const HOME = { lat: 28.6901, lon: 77.2111 };
const action = (id: string, name: string, data: object = {}) => actionPOST(jsonRequest(`/api/trips/${id}/${name}`, data), { params: Promise.resolve({ id, action: name }) });
const mails = () => vi.mocked(emailContact).mock.calls.map(([to, subject, text]) => ({ to, subject, text }));
const mailTo = (to: string) => mails().filter((m) => m.to === to);
const stopToken = (text: string) => /\/invite\/stop\/(v1\.[A-Za-z0-9_-]+)/.exec(text)![1];
const inviteToken = (text: string) => /\/invite\/([A-Za-z0-9_-]{20,})/.exec(text)![1];

async function signIn(name: string) {
  switchJar(newJar());
  const res = await demoPOST(jsonRequest("/api/auth/demo", { name }));
  expect(res.status).toBe(201);
}
async function addContact(body: object) {
  return contactsPOST(jsonRequest("/api/me/contacts", body));
}
/** An email contact who accepted through the link in their invite. */
async function accepted(name: string, email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`) {
  const { contact } = await (await addContact({ name, email })).json();
  expect(await acceptContactInvite(getSql(), inviteToken(mailTo(email).at(-1)!.text))).toBe(true);
  return { id: contact.id as string, email };
}
/** Run the worker on this trip as missed; only mail to `to` is returned (other test files may leave due trips behind). */
async function miss(tripId: string, to: string[]) {
  await getSql()`UPDATE journeys SET eta_at = now() - interval '11 minutes' WHERE id = ${tripId}`;
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  await processJourneys(getSql(), systemClock, { send: async (m) => (sent.push(m), { ok: true as const }) });
  return sent.filter((m) => to.includes(m.to));
}

describe("audit P2s: who MIRA emails, what it says, and who can make it stop", () => {
  beforeAll(async () => { applyTestEnv(); resetEnvCache(); await loadFixturePilot(getSql()); });
  beforeEach(async () => {
    vi.mocked(emailContact).mockClear();
    vi.mocked(emailContact).mockResolvedValue({ ok: true });
    await getSql()`DELETE FROM abuse_counters`;
    await recordHeartbeat(getSql(), "p2-worker", new Date(), "test", new Date());
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
  });

  it("P20-001: one address gets a few invites a day whoever sends them, never the name she typed, and can stop them for good", async () => {
    const victim = `victim-${randomUUID().slice(0, 8)}@example.test`;
    await signIn("Stalker");
    for (let i = 0; i < INVITE_RECIPIENT_LIMIT.max - 1; i++) {
      expect((await addContact({ name: "Priya answer me", email: victim })).status).toBe(201);
      const { contacts } = await (await contactsGET()).json();
      await getSql()`DELETE FROM contacts WHERE id = ${contacts[0].id}`; // delete and re-add: still counted
    }
    await signIn("Second"); // another account (and in real life another IP): the cap is per address, across senders
    expect((await addContact({ name: "Priya", email: victim, phone: "+919876543210" })).status).toBe(201);
    const capped = await addContact({ name: "Priya", email: victim });
    expect(capped.status).toBe(429);
    expect((await capped.json()).error).toMatchObject({ code: "recipient_invite_limit", fields: ["email"] });

    const invites = mailTo(victim);
    expect(invites).toHaveLength(INVITE_RECIPIENT_LIMIT.max);
    for (const m of invites) {
      expect(m.text).toMatch(/^Hello,\n/); // the name she saved them under (free text) never reaches an address that agreed to nothing
      expect(m.text).not.toMatch(/answer me/);
      expect(m.text).toMatch(/Stop all MIRA emails to this address:\nhttp:\/\/localhost:3100\/invite\/stop\/v1\./);
    }
    expect(invites[0].text).not.toContain(victim); // the stop link is sealed, not the address

    // Tapping stop (a POST: opening the link changes nothing). A forged token is refused.
    expect((await stopPOST(jsonRequest("/api/invites/stop", { token: "v1.forged-token-forged-token-forged-token-forged" }))).status).toBe(410);
    const stop = await stopPOST(jsonRequest("/api/invites/stop", { token: stopToken(invites[0].text) }));
    expect(stop.status).toBe(200);
    expect((await stopPOST(jsonRequest("/api/invites/stop", { token: stopToken(invites[0].text) }))).status).toBe(200); // twice: no-op

    // Stored only as the keyed hash; the Second account keeps the WhatsApp half of the contact and is told.
    const h = hmacHex("contact-email", victim);
    expect(await getSql()`SELECT 1 FROM email_suppressions WHERE email_hash = ${h}`).toHaveLength(1);
    expect(await getSql()`SELECT 1 FROM contacts WHERE email_hash = ${h}`).toHaveLength(0);
    const { contacts } = await (await contactsGET()).json();
    expect(contacts).toEqual([expect.objectContaining({ name: "Priya", status: "phone", emailHint: null, phone: "+919876543210" })]);
    const [note] = await getSql()`SELECT n.title, n.body FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.name = 'Second' AND n.kind = 'contact_stopped_email' ORDER BY n.id DESC LIMIT 1`;
    expect(note.title).toBe("Priya asked MIRA to stop emailing them");
    expect(note.body).toMatch(/They stay in your Circle on WhatsApp/);

    // Nobody can invite that address again, tomorrow included (not a rate limit).
    await getSql()`DELETE FROM abuse_counters`;
    await signIn("Third");
    vi.mocked(emailContact).mockClear();
    const again = await addContact({ name: "Priya", email: victim.toUpperCase() });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("email_stopped");
    expect(emailContact).not.toHaveBeenCalled();
  });

  it("P20-002: trip-share emails carry the stop link; stopping drops an email-only contact from her Circle and from the alert", async () => {
    await signIn("Asha");
    const sis = await accepted("Sis");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...HOME, name: "Home" }, recipientIds: [sis.id] }))).json();
    const share = mailTo(sis.email).find((m) => /is sharing a trip with you/.test(m.subject))!;
    expect(share.text).toMatch(/Stop all MIRA emails to this address:\nhttp:\/\/localhost:3100\/invite\/stop\/v1\./);
    expect((await stopPOST(jsonRequest("/api/invites/stop", { token: stopToken(share.text) }))).status).toBe(200);
    expect((await (await contactsGET()).json()).contacts).toEqual([]);
    expect(await miss(trip.id, [sis.email])).toEqual([]);
    await action(trip.id, "end");
  });

  it("P19-002: a destination change gets the same defusing as a start, so no links or forged lines reach her contacts", async () => {
    await signIn("Label");
    const sis = await accepted("Sis");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...HOME, name: "Home" }, recipientIds: [sis.id] }))).json();
    const changed = await action(trip.id, "change", { to: { ...HOME, name: "Gate 3\nURGENT: verify at https://p19-phish.example.com/login <b>now</b>" }, etaMinutes: 20 });
    expect(changed.status).toBe(200);
    expect((await changed.json()).trip.destination.name).toBe("Gate 3 URGENT: verify at p19-phish.example .com/login b now /b");
    const [alert] = await miss(trip.id, [sis.email]);
    expect(alert.text).toMatch(/was expected at Gate 3 URGENT: verify at p19-phish\.example \.com\/login b now \/b about/);
    expect(alert.text).not.toMatch(/https:\/\/p19|<b>/);
    await action(trip.id, "end");
  });

  it("L02-005: each alert and check-on email says how many others MIRA is emailing about it", async () => {
    await signIn("Meera");
    const ma = await accepted("Ma"), bro = await accepted("Bro");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...HOME, name: "Home" }, recipientIds: [ma.id, bro.id] }))).json();
    vi.mocked(emailContact).mockClear();
    expect((await action(trip.id, "checkon")).status).toBe(200);
    expect(mails()).toHaveLength(2);
    for (const m of mails()) {
      expect(m.text).toMatch(/Besides you, it is emailing 1 other person Meera chose about this, and no one else\./);
      expect(m.text).not.toMatch(/hasn't contacted anyone else/);
    }
    const alerts = await miss(trip.id, [ma.email, bro.email]);
    expect(alerts.map((m) => m.to).sort()).toEqual([ma.email, bro.email].sort());
    for (const m of alerts) expect(m.text).toMatch(/Besides you, it is emailing 1 other person Meera chose about this, and no one else\./);
    await action(trip.id, "end");

    // One recipient: the old sentence is true, so it stays.
    const { trip: solo } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...HOME, name: "Home" }, recipientIds: [ma.id] }))).json();
    const [only] = await miss(solo.id, [ma.email, bro.email]);
    expect(only.text).toMatch(/MIRA is not an emergency service and hasn't contacted anyone else\./);
    await action(solo.id, "end");
  });

  it("P02-007: a WhatsApp contact who accepts the email invite mid-journey stays a WhatsApp contact for that journey", async () => {
    await signIn("Meera");
    const binaEmail = `bina-${randomUUID().slice(0, 8)}@example.test`;
    const { contact: bina } = await (await addContact({ name: "Bina", email: binaEmail, phone: "+919812345678" })).json();
    expect(bina.status).toBe("invited");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...HOME, name: "Home" }, recipientIds: [bina.id] }))).json();
    expect(trip.sharedWith[0]).toMatchObject({ name: "Bina", viaEmail: false, linkDelivery: "not_attempted" });

    expect(await acceptContactInvite(getSql(), inviteToken(mailTo(binaEmail)[0].text))).toBe(true);
    const after = await (await action(trip.id, "extend", { minutes: 5 })).json(); // any fresh read of the trip
    expect(after.trip.sharedWith[0]).toMatchObject({ name: "Bina", viaEmail: false }); // no "Couldn't email your link to Bina"

    const sent = await miss(trip.id, [binaEmail]);
    expect(sent).toEqual([]); // she was told nobody is alerted automatically; that stays true for this journey
    const [j] = await getSql()`SELECT alert_state, user_id FROM journeys WHERE id = ${trip.id}`;
    expect(j.alert_state).toBe("not_attempted");
    await action(trip.id, "end");

    // On her next journey Bina is an accepted email contact, chosen as such: she gets the alert.
    const { trip: next } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...HOME, name: "Home" }, recipientIds: [bina.id] }))).json();
    expect(next.sharedWith[0]).toMatchObject({ viaEmail: true });
    expect((await miss(next.id, [binaEmail])).map((m) => m.to)).toEqual([binaEmail]);
    await action(next.id, "end");
  });

  it("P09-007: retries of a report whose reply was lost don't use up her hourly allowance", async () => {
    await signIn("Sunita");
    const send = (key: string, category: string) =>
      reportPOST(jsonRequest("/api/reports", { idempotencyKey: key, involvement: "witnessed", category, location: from, recency: "today", timeBand: "day" }));
    const first = randomUUID();
    expect((await send(first, "transport_issue")).status).toBe(201);
    for (let i = 0; i < 3; i++) expect((await send(first, "transport_issue")).status).toBe(200); // lost replies, retried
    for (const category of ["environment", "positive_condition", "harassment", "transport_issue"]) expect((await send(randomUUID(), category)).status).toBe(201);
    expect((await send(randomUUID(), "environment")).status).toBe(429); // the allowance itself still holds
  });
});
