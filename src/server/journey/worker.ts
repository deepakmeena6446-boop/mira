import type postgres from "postgres";
import { ALERT_UNCONFIRMED_AFTER_MS, EXPIRE_AFTER_ETA_MS, MISS_GRACE_MS, dueTransition, purgeAt, type JourneyState } from "@/domain/journey";
import { displayName } from "@/domain/know-copy";
import { decryptText } from "@/server/crypto";
import type { Clock } from "@/server/clock";
import type { Mailer } from "@/server/mail";
import { getEnv } from "@/server/config/env";
import { missedAlertEmail, tripMissedEmail } from "@/server/mail/templates";

export interface JourneyTickResult {
  missed: number;
  expired: number;
  alertsSent: number;
  alertsFailed: number;
  alertsUnconfirmed: number;
  purged: number;
}

interface PendingAlert {
  journeyId: string;
  email: string;
  message: { subject: string; text: string };
}

/**
 * One worker pass (architecture §6). Transitions are made under row locks
 * (FOR UPDATE SKIP LOCKED) so a racing user action and the worker can't both win.
 * The alert attempt is *claimed* in the same transaction as the miss; the SMTP send
 * happens once, after commit. A crash after the claim leaves it "claimed", which is
 * later shown as unconfirmed and never retried (at-most-once).
 */
export async function processJourneys(sql: postgres.Sql, clock: Clock, mailer: Mailer | null, log: (e: string, f?: Record<string, string | number | boolean | null>) => void = () => {}): Promise<JourneyTickResult> {
  const now = clock.now();
  const result: JourneyTickResult = { missed: 0, expired: 0, alertsSent: 0, alertsFailed: 0, alertsUnconfirmed: 0, purged: 0 };

  const stale = await sql`
    UPDATE journeys SET alert_state = 'unconfirmed'
    WHERE alert_state = 'claimed' AND alert_claimed_at < ${new Date(now.getTime() - ALERT_UNCONFIRMED_AFTER_MS)}`;
  result.alertsUnconfirmed += stale.count;

  const alerts: PendingAlert[] = [];
  await sql.begin(async (tx) => {
    const due = await tx<{ id: string; state: JourneyState; eta_at: Date; contact_state: string; place_id: string | null; dest_name: string | null; user_id: string | null; share_token_enc: string | null }[]>`
      SELECT id, state, eta_at, contact_state, place_id, dest_name, user_id, share_token_enc FROM journeys
      WHERE state IN ('active', 'missed') AND eta_at <= ${new Date(now.getTime() - MISS_GRACE_MS)}
      ORDER BY eta_at LIMIT 200
      FOR UPDATE SKIP LOCKED`;
    for (const j of due) {
      let state = j.state;
      if (dueTransition({ state, etaAt: new Date(j.eta_at) }, now) === "miss") {
        const recipients = await tx<{ encrypted_email: string }[]>`
          SELECT encrypted_email FROM contact_invites
          WHERE journey_id = ${j.id} AND accepted_at IS NOT NULL AND revoked_at IS NULL
          UNION ALL
          SELECT c.encrypted_email FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id
          WHERE tc.journey_id = ${j.id} AND c.accepted_at IS NOT NULL`;
        const canAlert = recipients.length > 0 && j.contact_state === "accepted" && mailer !== null;
        await tx`UPDATE journeys SET state = 'missed', missed_at = ${now},
                   alert_state = ${canAlert ? "claimed" : "not_attempted"}, alert_claimed_at = ${canAlert ? now : null}
                 WHERE id = ${j.id} AND state = 'active'`;
        state = "missed";
        result.missed += 1;
        log("journey.missed", { journey: j.id, alert: canAlert ? "claimed" : "not_attempted" });
        if (canAlert) {
          let message: PendingAlert["message"];
          if (j.user_id) {
            // MIRA 2.0 trip: the contact accepted this person once, so their first name and the
            // still-open live link are shared (the link closes with the trip).
            const [owner] = await tx<{ name: string }[]>`SELECT name FROM users WHERE id = ${j.user_id}`;
            message = tripMissedEmail({
              ownerName: (owner?.name ?? "Your contact").split(" ")[0],
              destination: j.dest_name ?? "their destination",
              minutesLate: Math.max(1, Math.round((now.getTime() - new Date(j.eta_at).getTime()) / 60_000)),
              liveUrl: j.share_token_enc ? new URL(`/t/${decryptText(j.share_token_enc, "share_token")}`, getEnv().APP_BASE_URL).toString() : null,
            });
          } else {
            let placeName: string | null = j.dest_name ?? null;
            if (!placeName && j.place_id) {
              const [p] = await tx<{ name: string | null; kind: string }[]>`SELECT name, tags->>'mira:kind' AS kind FROM places WHERE id = ${j.place_id}`;
              if (p) placeName = displayName(p.name, p.kind ?? "Place");
            }
            message = missedAlertEmail({ etaAt: new Date(j.eta_at), placeName });
          }
          for (const r of recipients) alerts.push({ journeyId: j.id, email: decryptText(r.encrypted_email, "contact_email"), message });
        }
      }
      if (state === "missed" && now.getTime() >= new Date(j.eta_at).getTime() + EXPIRE_AFTER_ETA_MS) {
        await tx`UPDATE journeys SET state = 'expired', closed_at = ${now}, purge_at = ${purgeAt(now)} WHERE id = ${j.id} AND state = 'missed'`;
        await tx`UPDATE contact_invites SET expires_at = LEAST(expires_at, ${now}) WHERE journey_id = ${j.id}`;
        await tx`DELETE FROM trip_locations WHERE journey_id = ${j.id}`;
        result.expired += 1;
        log("journey.expired", { journey: j.id });
      }
    }
  });

  const byJourney = new Map<string, PendingAlert[]>();
  for (const a of alerts) byJourney.set(a.journeyId, [...(byJourney.get(a.journeyId) ?? []), a]);
  for (const [journeyId, group] of byJourney) {
    const outcomes: Array<"sent" | "failed" | "unconfirmed"> = [];
    for (const a of group) {
      const res = await mailer!.send({ to: a.email, ...a.message });
      outcomes.push(res.ok ? "sent" : res.definite ? "failed" : "unconfirmed");
    }
    const outcome = outcomes.includes("sent") ? "sent" : outcomes.includes("unconfirmed") ? "unconfirmed" : "failed";
    await sql`UPDATE journeys SET alert_state = ${outcome} WHERE id = ${journeyId} AND alert_state = 'claimed'`;
    if (outcome === "sent") result.alertsSent += 1;
    else if (outcome === "failed") result.alertsFailed += 1;
    else result.alertsUnconfirmed += 1;
    log("journey.alert", { journey: journeyId, outcome, recipients: group.length });
  }

  const purged = await sql`DELETE FROM journeys WHERE purge_at <= ${now}`;
  result.purged = purged.count;
  if (purged.count) log("journey.purged", { count: purged.count });
  return result;
}
