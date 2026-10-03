import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);
vi.mock("@/server/providers/notify", async (original) => ({ ...await original<object>(), emailContact: vi.fn(async () => ({ ok: true })) }));

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { systemClock } from "@/server/clock";
import { recordHeartbeat } from "@/server/health/worker";
import { emailContact } from "@/server/providers/notify";
import { processJourneys } from "@/server/journey/worker";
import { tripById, sharedTrip } from "@/server/trips";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as actionPOST } from "@/app/api/trips/[id]/[action]/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar, type Jar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const from = { lat: 28.6927, lon: 77.2131 };
const action = (id: string, name: string, data: object = {}) => actionPOST(jsonRequest(`/api/trips/${id}/${name}`, data), { params: Promise.resolve({ id, action: name }) });
const tokenOf = (url: string) => /\/t\/([A-Za-z0-9_-]+)/.exec(decodeURIComponent(new URL(url).searchParams.get("text")!))![1];
let owner: Jar;
async function contact(name: string, email = false) {
  const response = await contactsPOST(jsonRequest("/api/me/contacts", { name, ...(email ? { email: `${name.toLowerCase()}-${randomUUID()}@example.test` } : { phone: name === "Noor" ? "+442079460958" : "+442079460959" }) }));
  const { contact } = await response.json();
  if (email) await getSql()`UPDATE contacts SET accepted_at = now() WHERE id = ${contact.id}`;
  return contact.id as string;
}

describe("explicit journey recipients, revocation and per-person delivery", () => {
  beforeAll(async () => { applyTestEnv(); resetEnvCache(); await loadFixturePilot(getSql()); });
  beforeEach(async () => {
    vi.mocked(emailContact).mockClear();
    vi.mocked(emailContact).mockResolvedValue({ ok: true });
    owner = newJar();
    switchJar(owner);
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Fictional traveler" }))).status).toBe(201);
    await recordHeartbeat(getSql(), "recipient-worker", new Date(), "test", new Date());
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
  });

  it("refuses implicit sharing; chooses only named owned eligible contacts and retries start exactly once", async () => {
    const noor = await contact("Noor");
    await contact("Ava");
    expect((await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30, share: true }))).status).toBe(400);
    const key = randomUUID();
    const body = { from, etaMinutes: 30, recipientIds: [noor], idempotencyKey: key };
    const first = await tripsPOST(jsonRequest("/api/trips", body));
    expect(first.status).toBe(201);
    const { trip } = await first.json();
    expect(trip.sharedWith.map((c: { id: string }) => c.id)).toEqual([noor]);
    const repeat = await (await tripsPOST(jsonRequest("/api/trips", body))).json();
    expect(repeat.trip.id).toBe(trip.id);
    expect((await tripsPOST(jsonRequest("/api/trips", { ...body, etaMinutes: 40 }))).status).toBe(409);
    expect((await getSql()`SELECT count(*)::int AS n FROM trip_locations WHERE journey_id = ${trip.id}`)[0].n).toBe(1);
    await action(trip.id, "end");
    const missing = await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30, recipientIds: [randomUUID()] }));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("invalid_recipients");
  });

  it("revokes one recipient without deleting contact; owner link revocation and recreation leave journey active", async () => {
    const noor = await contact("Noor"), ava = await contact("Ava");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30, recipientIds: [noor, ava] }))).json();
    const oldOwner = trip.shareUrl.split("/t/")[1];
    const recipientToken = tokenOf(trip.sharedWith.find((c: { id: string }) => c.id === noor).whatsapp);
    const otherToken = tokenOf(trip.sharedWith.find((c: { id: string }) => c.id === ava).whatsapp);
    const revoked = await (await action(trip.id, "revoke", { contactId: noor })).json();
    expect(revoked.trip.sharedWith.map((c: { id: string }) => c.id)).toEqual([ava]);
    expect(await sharedTrip(getSql(), recipientToken, new Date())).toBeNull();
    expect(await sharedTrip(getSql(), otherToken, new Date())).toMatchObject({ state: "active" });
    expect((await getSql()`SELECT id FROM contacts WHERE id = ${noor}`)).toHaveLength(1);
    const ownerRevoked = await (await action(trip.id, "revoke", { ownerLink: true })).json();
    expect(ownerRevoked.trip.shareUrl).toBeNull();
    expect(await sharedTrip(getSql(), oldOwner, new Date())).toBeNull();
    const regenerated = await (await action(trip.id, "link")).json();
    expect(regenerated.trip.shareUrl).not.toBe(trip.shareUrl);
    expect(regenerated.trip.state).toBe("active");
    await action(trip.id, "end");
    expect((await getSql()`SELECT count(*)::int AS n FROM trip_locations WHERE journey_id = ${trip.id}`)[0].n).toBe(0);
  });

  it("private check request never expands Circle; explicit check/share receipts prevent duplicate emails", async () => {
    const noor = await contact("Noor", true);
    await contact("Ava", true);
    vi.mocked(emailContact).mockClear();
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30 }))).json();
    expect((await action(trip.id, "checkon")).status).toBe(400);
    expect(emailContact).not.toHaveBeenCalled();
    const key = randomUUID();
    expect((await action(trip.id, "checkon", { recipientIds: [noor], idempotencyKey: key })).status).toBe(200);
    expect((await action(trip.id, "checkon", { recipientIds: [noor], idempotencyKey: key })).status).toBe(200);
    expect(emailContact).toHaveBeenCalledTimes(1);
    const shareKey = randomUUID();
    expect((await action(trip.id, "share", { recipientIds: [noor], idempotencyKey: shareKey })).status).toBe(200);
    expect((await action(trip.id, "share", { recipientIds: [noor], idempotencyKey: shareKey })).status).toBe(200);
    expect(emailContact).toHaveBeenCalledTimes(1); // existing recipient already received their check link
    await action(trip.id, "end");
  });

  it("mixed missed-email delivery records named results and never reports all recipients sent", async () => {
    const noor = await contact("Noor", true), ava = await contact("Ava", true);
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30, recipientIds: [noor, ava] }))).json();
    await getSql()`UPDATE journeys SET eta_at = now() - interval '11 minutes' WHERE id = ${trip.id}`;
    const [{ user_id }] = await getSql()`SELECT user_id FROM journeys WHERE id = ${trip.id}`;
    await processJourneys(getSql(), systemClock, { send: async (mail) => ({ ok: mail.to.startsWith("noor-"), definite: true }) });
    const view = await tripById(getSql(), user_id, trip.id, new Date());
    expect(view.alert).toBe("unconfirmed");
    expect(view.sharedWith.find((c) => c.id === noor)?.alertDelivery).toBe("sent");
    expect(view.sharedWith.find((c) => c.id === ava)?.alertDelivery).toBe("failed");
    await action(trip.id, "end");
  });

  it("foreign contact IDs and foreign journey actions cannot grant or revoke location access", async () => {
    const noor = await contact("Noor");
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30, recipientIds: [noor] }))).json();
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Another fictional traveler" }))).status).toBe(201);
    const ava = await contact("Ava");
    expect((await action(trip.id, "revoke", { contactId: noor })).status).toBe(404);
    expect((await action(trip.id, "share", { recipientIds: [ava] })).status).toBe(404);
    switchJar(owner);
    expect((await action(trip.id, "share", { recipientIds: [ava] })).status).toBe(400);
    expect((await action(trip.id, "checkon", { recipientIds: [ava] })).status).toBe(400);
    expect(emailContact).not.toHaveBeenCalled();
    await action(trip.id, "end");
  });

  it("a repeated destination change preserves its original ETA and a reused key cannot change the proposal", async () => {
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30 }))).json();
    const input = { to: { lat: 28.6901, lon: 77.2111, name: "Fictional venue" }, etaMinutes: 35, idempotencyKey: randomUUID() };
    const first = await (await action(trip.id, "change", input)).json();
    const repeat = await (await action(trip.id, "change", input)).json();
    expect(repeat.trip.etaAt).toBe(first.trip.etaAt);
    expect((await action(trip.id, "change", { ...input, etaMinutes: 40 })).status).toBe(409);
    await action(trip.id, "end");
  });
});
