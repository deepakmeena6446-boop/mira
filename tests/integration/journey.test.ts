import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { getMailer, resetMailer, type Mailer } from "@/server/mail";
import { fixedClock, MINUTE, HOUR } from "@/server/clock";
import { createJourney, currentJourney, extendJourney, revokeContact, userAction } from "@/server/journey/service";
import { processJourneys } from "@/server/journey/worker";
import { acceptInvite, viewInvite } from "@/server/journey/invites";
import { hashToken } from "@/server/crypto";
import { applyTestEnv } from "../setup/test-env";
import { loadFixturePilot, fixturePlaceId } from "../helpers/pilot";

const MAILPIT = "http://127.0.0.1:8025/api/v1";
const T0 = new Date("2026-09-24T14:00:00Z");
let placeId = "";

async function mailpitMessages(to: string) {
  const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const body = (await res.json()) as { messages: Array<{ ID: string; Subject: string }> };
  return body.messages;
}
async function mailpitText(id: string): Promise<string> {
  return ((await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string }).Text;
}
function inviteTokenFrom(text: string): string {
  return /\/invite\/([A-Za-z0-9_-]+)/.exec(text)![1];
}
const uniqueEmail = () => `contact-${randomUUID().slice(0, 8)}@example.test`;

function ctx(clock = fixedClock(T0), mailer: Mailer | null = getMailer()) {
  return { sql: getSql(), clock, mailer, workerHealthy: true };
}

describe("ACCOMPANY journeys (injected clock, real Mailpit)", () => {
  beforeAll(async () => {
    applyTestEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_FROM: "MIRA <no-reply@mira.test>" });
    resetEnvCache();
    resetMailer();
    await loadFixturePilot(getSql());
    placeId = await fixturePlaceId(getSql(), "Fixture Pharmacy");
  });
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
    resetMailer();
  });
  beforeEach(async () => {
    await getSql()`DELETE FROM journeys`;
    await getSql()`DELETE FROM abuse_counters`;
  });

  it("rejects ETAs outside 5 min – 4 h and requires a healthy worker", async () => {
    const base = { idempotencyKey: randomUUID(), destination: { placeId } };
    await expect(createJourney(ctx(), "a", { ...base, etaAt: new Date(T0.getTime() + 2 * MINUTE).toISOString() })).rejects.toMatchObject({ code: "invalid_eta" });
    await expect(createJourney(ctx(), "a", { ...base, etaAt: new Date(T0.getTime() + 5 * HOUR).toISOString() })).rejects.toMatchObject({ code: "invalid_eta" });
    await expect(createJourney({ ...ctx(), workerHealthy: false }, "a", { ...base, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() })).rejects.toMatchObject({ status: 503 });
  });

  it("arrival before ETA closes the journey and schedules deletion; nothing is sent", async () => {
    const clock = fixedClock(T0);
    const j = await createJourney(ctx(clock), "a", { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() });
    expect(j).toMatchObject({ state: "active", contact: "none", destination: { name: "Fixture Pharmacy", fromMap: true } });
    clock.advance(20 * MINUTE);
    const done = await userAction(getSql(), "a", j.id, "arrive", clock);
    expect(done.state).toBe("arrived");
    expect(new Date(done.purgeAt!).getTime() - new Date(done.closedAt!).getTime()).toBeLessThanOrEqual(24 * HOUR);
    clock.advance(30 * MINUTE);
    const tick = await processJourneys(getSql(), clock, getMailer());
    expect(tick.missed).toBe(0);
    expect((await userAction(getSql(), "a", j.id, "arrive", clock)).state).toBe("arrived"); // idempotent
    await expect(userAction(getSql(), "a", j.id, "end", clock)).rejects.toMatchObject({ status: 409 });
  });

  it("allows one extension and ending", async () => {
    const clock = fixedClock(T0);
    const j = await createJourney(ctx(clock), "a", { idempotencyKey: randomUUID(), destination: { label: "Hostel" }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() });
    expect(j.destination).toEqual({ name: "Hostel", fromMap: false });
    const [raw] = await getSql()`SELECT destination_label_enc FROM journeys WHERE id = ${j.id}`;
    expect(raw.destination_label_enc).not.toContain("Hostel");
    clock.advance(25 * MINUTE);
    const ext = await extendJourney(getSql(), "a", j.id, new Date(clock.now().getTime() + 30 * MINUTE).toISOString(), clock);
    expect(ext).toMatchObject({ extended: true, canExtend: false });
    await expect(extendJourney(getSql(), "a", j.id, new Date(clock.now().getTime() + 60 * MINUTE).toISOString(), clock)).rejects.toMatchObject({ code: "invalid_extension" });
    expect((await userAction(getSql(), "a", j.id, "end", clock)).state).toBe("ended");
  });

  it("enforces one open journey per browser and idempotent retries", async () => {
    const key = randomUUID();
    const input = { idempotencyKey: key, destination: { placeId }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() };
    const a = await createJourney(ctx(), "a", input);
    const retry = await createJourney(ctx(), "a", input);
    expect(retry.id).toBe(a.id);
    await expect(createJourney(ctx(), "a", { ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "journey_already_active" });
  });

  it("accepted contact gets exactly one missed-check-in email with no location details", async () => {
    const email = uniqueEmail();
    const clock = fixedClock(T0);
    const j = await createJourney(ctx(clock), "a", { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString(), contactEmail: email });
    expect(j.contact).toBe("invite_pending");
    const invites = await mailpitMessages(email);
    expect(invites).toHaveLength(1);
    const token = inviteTokenFrom(await mailpitText(invites[0].ID));
    const [inv] = await getSql()`SELECT token_hash, encrypted_email FROM contact_invites WHERE journey_id = ${j.id}`;
    expect(inv.token_hash).toBe(hashToken("invite", token));
    expect(inv.encrypted_email).not.toContain("@");

    const view = await viewInvite(getSql(), token, clock.now());
    expect(view).toMatchObject({ status: "valid", placeName: "Fixture Pharmacy" });
    expect(await acceptInvite(getSql(), token, clock.now())).toBe("accepted");
    expect(await acceptInvite(getSql(), token, clock.now())).toBe("accepted");

    clock.advance(39 * MINUTE); // ETA + 9
    expect((await processJourneys(getSql(), clock, getMailer())).missed).toBe(0);
    clock.advance(1 * MINUTE); // ETA + 10
    const tick = await processJourneys(getSql(), clock, getMailer());
    expect(tick).toMatchObject({ missed: 1, alertsSent: 1 });
    clock.advance(1 * MINUTE);
    await processJourneys(getSql(), clock, getMailer()); // no second attempt
    const msgs = await mailpitMessages(email);
    expect(msgs).toHaveLength(2); // invitation + one alert
    const alert = msgs.find((m) => m.Subject.includes("missed"))!;
    const text = await mailpitText(alert.ID);
    expect(text).toContain("Destination: Fixture Pharmacy");
    expect(text).not.toMatch(/28\.\d|77\.\d|route|origin|https?:\/\//i);
    expect((await currentJourney(getSql(), "a", clock.now()))!).toMatchObject({ state: "missed", alert: "sent" });

    clock.set(new Date(T0.getTime() + 60 * MINUTE)); // ETA + 30
    expect((await processJourneys(getSql(), clock, getMailer())).expired).toBe(1);
    expect((await viewInvite(getSql(), token, clock.now())).status).toBe("expired");
    const closed = await currentJourney(getSql(), "a", clock.now());
    expect(closed!.state).toBe("expired");
    clock.set(new Date(closed!.purgeAt!));
    expect((await processJourneys(getSql(), clock, getMailer())).purged).toBe(1);
    const [{ n }] = await getSql()`SELECT count(*)::int AS n FROM contact_invites`;
    expect(n).toBe(0);
    expect(await currentJourney(getSql(), "a", clock.now())).toBeNull();
  });

  it("pending, revoked and no-SMTP contacts get no alert; missed without contact says nobody was notified", async () => {
    const pendingEmail = uniqueEmail();
    const clock = fixedClock(T0);
    const p = await createJourney(ctx(clock), "p", { idempotencyKey: randomUUID(), destination: { label: "Home" }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString(), contactEmail: pendingEmail });
    const revokedEmail = uniqueEmail();
    const r = await createJourney(ctx(clock), "r", { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString(), contactEmail: revokedEmail });
    const token = inviteTokenFrom(await mailpitText((await mailpitMessages(revokedEmail))[0].ID));
    await acceptInvite(getSql(), token, clock.now());
    await revokeContact(getSql(), "r", r.id, clock);
    expect((await viewInvite(getSql(), token, clock.now())).status).toBe("revoked");
    const n = await createJourney(ctx(clock), "n", { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() });

    clock.advance(41 * MINUTE);
    const tick = await processJourneys(getSql(), clock, getMailer());
    expect(tick).toMatchObject({ missed: 3, alertsSent: 0 });
    expect(await mailpitMessages(pendingEmail)).toHaveLength(1); // invitation only
    expect(await mailpitMessages(revokedEmail)).toHaveLength(1);
    for (const [actor, id] of [["p", p.id], ["r", r.id], ["n", n.id]] as const) {
      const v = await currentJourney(getSql(), actor, clock.now());
      expect(v).toMatchObject({ id, state: "missed", alert: "not_attempted" });
    }
    // With SMTP unavailable, an accepted contact still gets nothing.
    await expect(createJourney(ctx(clock, null), "x", { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(clock.now().getTime() + 30 * MINUTE).toISOString(), contactEmail: uniqueEmail() })).rejects.toMatchObject({ code: "contact_unavailable" });
  });

  it("records a definite delivery failure and never retries; a crash leaves it unconfirmed", async () => {
    const failing: Mailer = { send: vi.fn(async () => ({ ok: false as const, definite: true })) };
    const invitingOk: Mailer = { send: async () => ({ ok: true as const }) };
    const clock = fixedClock(T0);
    const j = await createJourney(ctx(clock, invitingOk), "f", { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString(), contactEmail: uniqueEmail() });
    await getSql()`UPDATE contact_invites SET accepted_at = ${clock.now()} WHERE journey_id = ${j.id}`;
    await getSql()`UPDATE journeys SET contact_state = 'accepted' WHERE id = ${j.id}`;
    clock.advance(40 * MINUTE);
    const tick = await processJourneys(getSql(), clock, failing);
    expect(tick.alertsFailed).toBe(1);
    clock.advance(MINUTE);
    await processJourneys(getSql(), clock, failing);
    expect(failing.send).toHaveBeenCalledTimes(1);
    expect((await currentJourney(getSql(), "f", clock.now()))!.alert).toBe("failed");

    // Simulated crash after claim: alert stays "claimed", then is reported unconfirmed.
    await getSql()`UPDATE journeys SET alert_state = 'claimed', alert_claimed_at = ${clock.now()} WHERE id = ${j.id}`;
    clock.advance(6 * MINUTE);
    const t2 = await processJourneys(getSql(), clock, failing);
    expect(t2.alertsUnconfirmed).toBe(1);
    expect(failing.send).toHaveBeenCalledTimes(1);
    expect((await currentJourney(getSql(), "f", clock.now()))!.alert).toBe("unconfirmed");
  });

  it("race between arrive and the worker yields one valid terminal outcome", async () => {
    for (let round = 0; round < 10; round++) {
      await getSql()`DELETE FROM journeys`;
      const clock = fixedClock(T0);
      const j = await createJourney(ctx(clock), `race${round}`, { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() });
      clock.advance(40 * MINUTE);
      const [a, w] = await Promise.allSettled([userAction(getSql(), `race${round}`, j.id, "arrive", clock), processJourneys(getSql(), clock, getMailer())]);
      expect(a.status).toBe("fulfilled");
      expect(w.status).toBe("fulfilled");
      const [row] = await getSql()`SELECT state, alert_state, closed_at FROM journeys WHERE id = ${j.id}`;
      expect(row.state).toBe("arrived");
      expect(row.closed_at).not.toBeNull();
      expect(["none", "not_attempted"]).toContain(row.alert_state);
    }
  });

  it("works with the tab closed: the worker alone expires and deletes", async () => {
    const clock = fixedClock(T0);
    await createJourney(ctx(clock), "closed-tab", { idempotencyKey: randomUUID(), destination: { placeId }, etaAt: new Date(T0.getTime() + 10 * MINUTE).toISOString() });
    // No further user requests at all.
    for (let t = 0; t < 12; t++) {
      clock.advance(10 * MINUTE);
      await processJourneys(getSql(), clock, getMailer());
    }
    const [{ n }] = await getSql()`SELECT count(*)::int AS n FROM journeys WHERE owner_actor_hash = 'closed-tab'`;
    expect(n).toBe(1); // expired, awaiting purge
    clock.advance(6 * HOUR);
    await processJourneys(getSql(), clock, getMailer());
    const [{ m }] = await getSql()`SELECT count(*)::int AS m FROM journeys WHERE owner_actor_hash = 'closed-tab'`;
    expect(m).toBe(0);
  });
});
