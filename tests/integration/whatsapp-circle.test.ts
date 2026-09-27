import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { resetMailer } from "@/server/mail";
import { recordHeartbeat } from "@/server/health/worker";
import { systemClock } from "@/server/clock";
import { processJourneys } from "@/server/journey/worker";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { GET as contactsGET, POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { GET as sharedGET } from "@/app/api/t/[token]/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { getRequest, jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const HOME = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };
const action = (id: string, a: string) => tripActionPOST(jsonRequest(`/api/trips/${id}/${a}`, {}), { params: Promise.resolve({ id, action: a }) });
const tokenOf = (waUrl: string) => /\/t\/([A-Za-z0-9_-]+)/.exec(decodeURIComponent(new URL(waUrl).searchParams.get("text")!))![1];

async function signIn(name: string) {
  switchJar(newJar());
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
}

describe("Circle on WhatsApp: she sends her link in one tap; MIRA never claims it was sent", () => {
  beforeAll(async () => {
    applyTestEnv(); // no email provider: WhatsApp must work on its own
    resetEnvCache();
    resetMailer();
    await loadFixturePilot(getSql());
  });
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
  });
  beforeEach(async () => {
    await getSql()`DELETE FROM abuse_counters`;
    await recordHeartbeat(getSql(), "wa-worker", new Date(), "test", new Date()); // trips start only while the worker is up
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
  });

  it("saves a local number with her country's code, encrypted, and refuses one that can't be a number", async () => {
    await signIn("Asha");
    const res = await contactsPOST(jsonRequest("/api/me/contacts", { name: "Priya", phone: "98765 43210", country: "IN" }));
    expect(res.status).toBe(201);
    const { contact } = await res.json();
    expect(contact).toMatchObject({ name: "Priya", phone: "+919876543210", phoneHint: "+91 •••• ••3210", emailHint: null, status: "phone" });
    const [row] = await getSql()`SELECT phone_enc, encrypted_email FROM contacts WHERE id = ${contact.id}`;
    expect(String(row.phone_enc)).toMatch(/^v1\./); // never stored in plain text
    expect(row.encrypted_email).toBeNull();
    expect((await contactsPOST(jsonRequest("/api/me/contacts", { name: "Priya again", phone: "+91 98765-43210" }))).status).toBe(409); // same number
    const bad = await contactsPOST(jsonRequest("/api/me/contacts", { name: "Nobody", phone: "call me" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("invalid_phone");
    expect((await contactsPOST(jsonRequest("/api/me/contacts", { name: "Nothing" }))).status).toBe(400); // a number or an email
    expect((await (await contactsGET()).json()).contacts).toHaveLength(1);
  });

  it("gives each WhatsApp contact their own live link on a shared journey, and never counts them as notified", async () => {
    await signIn("Meera");
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Ravi", phone: "+44 20 7946 0958" }));
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: true }))).json();
    expect(trip.sharedWith).toHaveLength(1);
    const [ravi] = trip.sharedWith;
    expect(ravi).toMatchObject({ name: "Ravi", notified: false, viaEmail: false });
    expect(ravi.whatsapp).toMatch(/^https:\/\/wa\.me\/442079460958\?text=/);
    const text = new URL(ravi.whatsapp).searchParams.get("text")!;
    expect(text).toMatch(/^I'm walking to Home\. Follow along live on MIRA until I arrive: http/);
    expect(text).not.toMatch(/\d+\.\d{4,}/); // a link, never coordinates

    // The friend opens it with no account: latest spot only, and no promise that MIRA will email them.
    const token = tokenOf(ravi.whatsapp);
    const view = await (await sharedGET(getRequest(`/api/t/${token}`), { params: Promise.resolve({ token }) })).json();
    expect(view).toMatchObject({ name: "Meera", state: "active", alertsViewer: false });

    // "Tell my people now": a ready WhatsApp message asking them to check on her — nothing counted as told.
    const told = await (await action(trip.id, "checkon")).json();
    expect(told.told).toEqual([]);
    expect(told.whatsapp).toHaveLength(1);
    expect(decodeURIComponent(told.whatsapp[0].url)).toMatch(/Can you check on me\?/);

    // Removing the contact revokes their link at once.
    await getSql()`DELETE FROM contacts WHERE name = 'Ravi'`;
    expect((await sharedGET(getRequest(`/api/t/${token}`), { params: Promise.resolve({ token }) })).status).toBe(404);
    await action(trip.id, "end");
  });

  it("a private journey creates no contact links, and a missed check-in never claims a WhatsApp contact was alerted", async () => {
    await signIn("Nila");
    await contactsPOST(jsonRequest("/api/me/contacts", { name: "Kavya", phone: "+91 91234 56789" }));
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false }))).json();
    expect(trip.sharedWith).toEqual([]);
    await action(trip.id, "end");

    const shared = await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: true }))).json();
    await getSql()`UPDATE journeys SET eta_at = now() - interval '20 minutes' WHERE id = ${shared.trip.id}`;
    const sends: string[] = [];
    await processJourneys(getSql(), systemClock, { send: async (m: { to: string }) => (sends.push(m.to), { ok: true as const }) } as never);
    expect(sends).toEqual([]); // MIRA can't message WhatsApp contacts: nothing is sent, and nothing says it was
    const [j] = await getSql()`SELECT alert_state, user_id FROM journeys WHERE id = ${shared.trip.id}`;
    expect(j.alert_state).toBe("not_attempted");
    const [note] = await getSql()`SELECT body FROM notifications WHERE user_id = ${j.user_id} AND kind = 'trip_missed'`;
    expect(note.body).toMatch(/Nobody was notified/);
  });
});
