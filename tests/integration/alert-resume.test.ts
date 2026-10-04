import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);
vi.mock("@/server/providers/notify", async (original) => ({ ...await original<object>(), emailContact: vi.fn(async () => ({ ok: true })) }));

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { fixedClock, MINUTE } from "@/server/clock";
import { recordHeartbeat } from "@/server/health/worker";
import type { Mailer } from "@/server/mail";
import { processJourneys } from "@/server/journey/worker";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as contactsPOST } from "@/app/api/me/contacts/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as actionPOST } from "@/app/api/trips/[id]/[action]/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const from = { lat: 28.6927, lon: 77.2131 };
async function acceptedContact(name: string) {
  const response = await contactsPOST(jsonRequest("/api/me/contacts", { name, email: `${name.toLowerCase()}-${randomUUID()}@example.test` }));
  const { contact } = await response.json();
  await getSql()`UPDATE contacts SET accepted_at = now() WHERE id = ${contact.id}`;
  return contact.id as string;
}
/** A journey whose missed-check-in alert was claimed by a pass that then died, `claimedAgo` ago. */
async function claimedThenDied(recipientIds: string[], claimedAgo: number) {
  const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, etaMinutes: 30, recipientIds }))).json();
  const claimedAt = new Date(Date.now() - claimedAgo);
  await getSql()`UPDATE journeys SET state = 'missed', missed_at = ${claimedAt}, eta_at = ${new Date(Date.now() - 15 * MINUTE)},
    alert_state = 'claimed', alert_claimed_at = ${claimedAt} WHERE id = ${trip.id}`;
  await getSql()`UPDATE trip_contacts SET alert_delivery = 'claimed' WHERE journey_id = ${trip.id}`;
  return trip.id as string;
}
const delivery = async (journeyId: string) =>
  Object.fromEntries((await getSql()<{ contact_id: string; alert_delivery: string }[]>`SELECT contact_id, alert_delivery FROM trip_contacts WHERE journey_id = ${journeyId}`).map((r) => [r.contact_id, r.alert_delivery]));
const journeyAlert = async (id: string) => (await getSql()<{ alert_state: string; state: string }[]>`SELECT alert_state, state FROM journeys WHERE id = ${id}`)[0];

describe("a missed-check-in alert survives the worker dying after the claim (audit P0-7)", () => {
  beforeAll(async () => { applyTestEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_FROM: "MIRA <no-reply@mira.test>" }); resetEnvCache(); await loadFixturePilot(getSql()); });
  beforeEach(async () => {
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Fictional traveler" }))).status).toBe(201);
    await recordHeartbeat(getSql(), "resume-worker", new Date(), "test", new Date());
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
  });

  it("sends each never-attempted contact exactly once; one cut off mid-send is unconfirmed, never re-sent", async () => {
    const asha = await acceptedContact("Asha"), bina = await acceptedContact("Bina");
    const id = await claimedThenDied([asha, bina], 2 * MINUTE);
    // Bina's send was in flight when the worker died: it may have gone out.
    await getSql()`UPDATE trip_contacts SET alert_delivery = 'sending' WHERE journey_id = ${id} AND contact_id = ${bina}`;
    const mailer: Mailer = { send: vi.fn(async () => ({ ok: true as const })) };

    await processJourneys(getSql(), fixedClock(new Date()), mailer);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(await delivery(id)).toEqual({ [asha]: "sent", [bina]: "sending" });
    expect((await journeyAlert(id)).alert_state).toBe("claimed"); // Bina still undecided

    // Past the unconfirmed window, the cut-off send is called what it is; nothing is sent again.
    await processJourneys(getSql(), fixedClock(new Date(Date.now() + 6 * MINUTE)), mailer);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(await delivery(id)).toEqual({ [asha]: "sent", [bina]: "unconfirmed" });
    expect((await journeyAlert(id)).alert_state).toBe("unconfirmed");
    const [n] = await getSql()<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications n JOIN journeys j ON j.user_id = n.user_id WHERE j.id = ${id} AND n.kind = 'trip_alert_failed'`;
    expect(n.n).toBe(1);
  });

  it("two passes racing on the same dead claim still send each contact once", async () => {
    const asha = await acceptedContact("Asha"), bina = await acceptedContact("Bina");
    const id = await claimedThenDied([asha, bina], 2 * MINUTE);
    const mailer: Mailer = { send: vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return { ok: true as const }; }) };
    await Promise.all([processJourneys(getSql(), fixedClock(new Date()), mailer), processJourneys(getSql(), fixedClock(new Date()), mailer)]);
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(await delivery(id)).toEqual({ [asha]: "sent", [bina]: "sent" });
    expect((await journeyAlert(id)).alert_state).toBe("sent");
  });

  it("never sends after she arrived, even with a dead claim pending", async () => {
    const asha = await acceptedContact("Asha");
    const id = await claimedThenDied([asha], 2 * MINUTE);
    await getSql()`UPDATE journeys SET state = 'arrived', closed_at = now(), purge_at = now() + interval '6 hours' WHERE id = ${id}`;
    const mailer: Mailer = { send: vi.fn(async () => ({ ok: true as const })) };
    await processJourneys(getSql(), fixedClock(new Date()), mailer);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(await delivery(id)).toEqual({ [asha]: "not_attempted" });
  });

  it("contacts told she missed are told it's over when she ends the trip — even one she removed after the alert (P02-003)", async () => {
    const asha = await acceptedContact("Asha"), bina = await acceptedContact("Bina");
    const id = await claimedThenDied([asha, bina], 0);
    await getSql()`UPDATE trip_contacts SET alert_delivery = 'sent' WHERE journey_id = ${id}`;
    await getSql()`UPDATE journeys SET alert_state = 'sent' WHERE id = ${id}`;
    const action = (name: string, data: object = {}) => actionPOST(jsonRequest(`/api/trips/${id}/${name}`, data), { params: Promise.resolve({ id, action: name }) });
    expect((await action("revoke", { contactId: bina })).status).toBe(200);
    expect((await action("end")).status).toBe(200);
    const mailer: Mailer = { send: vi.fn(async () => ({ ok: true as const })) };
    await processJourneys(getSql(), fixedClock(new Date()), mailer);
    await processJourneys(getSql(), fixedClock(new Date()), mailer); // and only once
    const sent = vi.mocked(mailer.send).mock.calls.map(([m]) => m as { to: string; subject: string });
    expect(sent).toHaveLength(2);
    for (const m of sent) expect(m.subject).toMatch(/ended their trip on MIRA/);
  });
});
