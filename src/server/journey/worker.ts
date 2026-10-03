import type postgres from "postgres";
import { ALERT_UNCONFIRMED_AFTER_MS, EXPIRE_AFTER_ETA_MS, MISS_GRACE_MS, dueTransition, purgeAt, type JourneyState } from "@/domain/journey";
import { displayName } from "@/domain/know-copy";
import { decryptText } from "@/server/crypto";
import type { Clock } from "@/server/clock";
import type { Mailer } from "@/server/mail";
import { getEnv } from "@/server/config/env";
import { recordHeartbeat } from "@/server/health/worker";
import { missedAlertEmail, tripArrivedEmail, tripMissedEmail } from "@/server/mail/templates";
import { errCode } from "@/server/log/err-code";

/** No live point for this long on an active trip → tell the owner once (re-armed when points resume). */
export const STALE_AFTER_MS = 10 * 60_000;

/** Heartbeat row written after each completed journeys pass; readiness requires it to be fresh. */
export const JOURNEYS_JOB_ID = "job:journeys";

export interface JourneyTickResult {
  staleNudged: number;
  missed: number;
  expired: number;
  alertsSent: number;
  alertsFailed: number;
  alertsUnconfirmed: number;
  arrivedNotices: number;
  failedJourneys: number;
  purged: number;
}

interface PendingAlert {
  journeyId: string;
  userId: string | null;
  who: string;
  sends: Array<{ contactId: string | null; name: string; email: string; message: { subject: string; text: string } }>;
}

type Log = (e: string, f?: Record<string, string | number | boolean | null>) => void;

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const liveUrl = (enc: string | null) => (enc ? new URL(`/t/${decryptText(enc, "share_token")}`, getEnv().APP_BASE_URL).toString() : null);
const errName = errCode;

async function notifyAlertUncertain(sql: postgres.Sql, userId: string, who: string) {
  await sql`INSERT INTO notifications (user_id, kind, title, body, href) VALUES (${userId}, 'trip_alert_failed', 'Your contacts may not have been told',
    ${`I couldn't confirm the email to ${who} went out. If you need them, call or message them directly.`}, '/trip')`;
}

/**
 * One worker pass (architecture §6). Each due journey is handled in its own transaction
 * under a row lock (FOR UPDATE SKIP LOCKED), so a racing user action and the worker can't
 * both win, and one bad row can't stall every other alert. The alert attempt is *claimed*
 * in the same transaction as the miss; the SMTP send happens once, after commit. A crash
 * after the claim leaves it "claimed", later shown as unconfirmed and never retried.
 */
export async function processJourneys(sql: postgres.Sql, clock: Clock, mailer: Mailer | null, log: Log = () => {}): Promise<JourneyTickResult> {
  const now = clock.now();
  const result: JourneyTickResult = { staleNudged: 0, missed: 0, expired: 0, alertsSent: 0, alertsFailed: 0, alertsUnconfirmed: 0, arrivedNotices: 0, failedJourneys: 0, purged: 0 };

  // A claim that never completed (the worker died mid-send): say so to the traveller, never leave "I'm emailing…" standing.
  const stale = await sql<{ id: string; user_id: string | null }[]>`
    UPDATE journeys SET alert_state = 'unconfirmed'
    WHERE alert_state = 'claimed' AND alert_claimed_at < ${new Date(now.getTime() - ALERT_UNCONFIRMED_AFTER_MS)}
    RETURNING id, user_id`;
  result.alertsUnconfirmed += stale.length;
  for (const journey of stale) await sql`UPDATE trip_contacts SET alert_delivery = 'unconfirmed' WHERE journey_id = ${journey.id} AND alert_delivery = 'claimed' AND revoked_at IS NULL`;
  for (const j of stale) {
    if (j.user_id) await notifyAlertUncertain(sql, j.user_id, "your contacts");
    log("journey.alert", { journey: j.id, outcome: "unconfirmed", recipients: 0 });
  }

  // Only rows with work to do: active past the grace period, or missed and due to expire.
  const due = await sql<{ id: string }[]>`
    SELECT id FROM journeys
    WHERE (state = 'active' AND eta_at <= ${new Date(now.getTime() - MISS_GRACE_MS)})
       OR (state = 'missed' AND eta_at <= ${new Date(now.getTime() - EXPIRE_AFTER_ETA_MS)})
    ORDER BY eta_at LIMIT 200`;

  const alerts: PendingAlert[] = [];
  for (const { id } of due) {
    try {
      const pending = await sql.begin(async (tx) => {
        const [j] = await tx<{ id: string; state: JourneyState; eta_at: Date; contact_state: string; place_id: string | null; dest_name: string | null; user_id: string | null; tz: string | null }[]>`
          SELECT id, state, eta_at, contact_state, place_id, dest_name, user_id, tz FROM journeys WHERE id = ${id} FOR UPDATE SKIP LOCKED`;
        if (!j) return null; // taken by a user action right now, or gone

        if (j.state === "active" && dueTransition({ state: j.state, etaAt: new Date(j.eta_at) }, now) === "miss") {
          // MIRA 2.0 trips alert every accepted contact on the trip, each with their own live link.
          const contacts = j.user_id
            ? await tx<{ contact_id: string | null; name: string; encrypted_email: string; share_token_enc: string | null }[]>`
                SELECT c.id AS contact_id, c.name, c.encrypted_email, tc.share_token_enc FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id
                WHERE tc.journey_id = ${j.id} AND c.accepted_at IS NOT NULL AND tc.revoked_at IS NULL ORDER BY c.name`
            : await tx<{ contact_id: string | null; name: string; encrypted_email: string; share_token_enc: string | null }[]>`
                SELECT NULL AS contact_id, '' AS name, encrypted_email, NULL AS share_token_enc FROM contact_invites
                WHERE journey_id = ${j.id} AND accepted_at IS NOT NULL AND revoked_at IS NULL`;
          const hasRecipients = contacts.length > 0 && (j.user_id !== null || j.contact_state === "accepted");
          const canAlert = hasRecipients && mailer !== null;
          await tx`UPDATE journeys SET state = 'missed', missed_at = ${now},
                     alert_state = ${canAlert ? "claimed" : "not_attempted"}, alert_claimed_at = ${canAlert ? now : null}
                   WHERE id = ${j.id} AND state = 'active'`;
          if (j.user_id) await tx`UPDATE trip_contacts tc SET alert_delivery = ${canAlert ? "claimed" : "not_attempted"}
            FROM contacts c WHERE tc.journey_id = ${j.id} AND tc.contact_id = c.id AND tc.revoked_at IS NULL AND c.accepted_at IS NOT NULL`;
          result.missed += 1;
          const who = joinNames(contacts.map((c) => c.name));
          if (j.user_id) {
            await tx`INSERT INTO notifications (user_id, kind, title, body, href) VALUES (${j.user_id}, 'trip_missed', 'You missed your check-in',
              ${
                canAlert
                  ? `I'm emailing ${who} to say you haven't checked in. If you're fine, tap "I'm here".`
                  : hasRecipients
                    ? `Email isn't available right now, so nobody was notified. If you've arrived, tap "I'm here".`
                    : `Nobody was notified — MIRA only emails contacts who accepted an invite, and it can't send WhatsApp for you. If you've arrived, tap "I'm here".`
              }, '/trip')`;
          }
          log("journey.missed", { journey: j.id, alert: canAlert ? "claimed" : "not_attempted" });
          if (!canAlert) return null;

          let owner = "Your contact";
          if (j.user_id) owner = ((await tx<{ name: string }[]>`SELECT name FROM users WHERE id = ${j.user_id}`)[0]?.name ?? owner).split(" ")[0];
          let placeName: string | null = j.dest_name ?? null;
          if (!j.user_id && !placeName && j.place_id) {
            const [p] = await tx<{ name: string | null; kind: string }[]>`SELECT name, tags->>'mira:kind' AS kind FROM places WHERE id = ${j.place_id}`;
            if (p) placeName = displayName(p.name, p.kind ?? "Place");
          }
          const minutesLate = Math.max(1, Math.round((now.getTime() - new Date(j.eta_at).getTime()) / 60_000));
          return {
            journeyId: j.id,
            userId: j.user_id,
            who,
            sends: contacts.map((c) => ({
              contactId: c.contact_id,
              name: c.name,
              email: decryptText(c.encrypted_email, "contact_email"),
              message: j.user_id
                ? tripMissedEmail({ ownerName: owner, destination: j.dest_name ?? "their destination", minutesLate, liveUrl: liveUrl(c.share_token_enc), etaAt: new Date(j.eta_at), tz: j.tz })
                : missedAlertEmail({ etaAt: new Date(j.eta_at), placeName, tz: j.tz }),
            })),
          } satisfies PendingAlert;
        }

        // Expire only trips that were already missed before this pass, so contacts get
        // at least one pass with a working link after the alert.
        if (j.state === "missed" && now.getTime() >= new Date(j.eta_at).getTime() + EXPIRE_AFTER_ETA_MS) {
          await tx`UPDATE journeys SET state = 'expired', closed_at = ${now}, purge_at = ${purgeAt(now)} WHERE id = ${j.id} AND state = 'missed'`;
          await tx`UPDATE contact_invites SET expires_at = LEAST(expires_at, ${now}) WHERE journey_id = ${j.id}`;
          await tx`DELETE FROM trip_locations WHERE journey_id = ${j.id}`;
          result.expired += 1;
          log("journey.expired", { journey: j.id });
        }
        return null;
      });
      if (pending) alerts.push(pending);
    } catch (err) {
      // One bad row (e.g. undecryptable data) is logged and skipped; everyone else still gets their alert.
      result.failedJourneys += 1;
      log("journey.failed", { journey: id, error: errName(err) });
    }
  }

  // Send the claimed alerts FIRST, before any other work in this pass can throw. Each alert is
  // isolated: one failing send (or a database error recording it) can't drop anyone else's.
  for (const a of alerts) {
    try {
      const outcomes: Array<"sent" | "failed" | "unconfirmed"> = [];
      for (const s of a.sends) {
        if (s.contactId) {
          const [consent] = await sql`SELECT 1 FROM trip_contacts tc JOIN journeys j ON j.id = tc.journey_id
            WHERE tc.journey_id = ${a.journeyId} AND tc.contact_id = ${s.contactId} AND tc.revoked_at IS NULL AND j.state IN ('active', 'missed')`;
          if (!consent) { outcomes.push("failed"); continue; }
        }
        const res = await mailer!.send({ to: s.email, ...s.message }).catch(() => ({ ok: false, definite: false }));
        const delivery = res.ok ? "sent" : res.definite ? "failed" : "unconfirmed";
        outcomes.push(delivery);
        if (s.contactId) await sql`UPDATE trip_contacts SET alert_delivery = ${delivery} WHERE journey_id = ${a.journeyId} AND contact_id = ${s.contactId} AND revoked_at IS NULL`;
      }
      const outcome = outcomes.every((item) => item === "sent") ? "sent" : outcomes.includes("unconfirmed") || outcomes.includes("sent") ? "unconfirmed" : "failed";
      await sql`UPDATE journeys SET alert_state = ${outcome} WHERE id = ${a.journeyId} AND alert_state = 'claimed'`;
      // Correct the earlier "I'm emailing…" so the traveller never believes a message went out when it didn't —
      // per person: one accepted send must not stand in for a contact whose email failed.
      const notConfirmed = a.sends.filter((_, i) => outcomes[i] !== "sent").map((s) => s.name);
      if (notConfirmed.length && a.userId) await notifyAlertUncertain(sql, a.userId, joinNames(notConfirmed));
      if (outcome === "sent") result.alertsSent += 1;
      else if (outcome === "failed") result.alertsFailed += 1;
      else result.alertsUnconfirmed += 1;
      log("journey.alert", { journey: a.journeyId, outcome, recipients: a.sends.length, unconfirmed: notConfirmed.length });
    } catch (err) {
      // Left "claimed": the next pass turns it into "unconfirmed" and tells the traveller.
      result.failedJourneys += 1;
      log("journey.alert_failed", { journey: a.journeyId, error: errName(err) });
    }
  }

  // Live location paused on an active trip (phone locked, GPS off, no signal). One nudge
  // per pause; once the ETA passes, the missed-arrival flow takes over instead.
  const paused = await sql<{ id: string; user_id: string; shared: boolean }[]>`
    UPDATE journeys j SET stale_notified_at = ${now}
    WHERE j.state = 'active' AND j.user_id IS NOT NULL AND j.eta_at > ${now}
      AND j.last_location_at < ${new Date(now.getTime() - STALE_AFTER_MS)}
      AND (j.stale_notified_at IS NULL OR j.stale_notified_at < j.last_location_at)
    RETURNING j.id, j.user_id, EXISTS (SELECT 1 FROM trip_contacts tc WHERE tc.journey_id = j.id AND tc.notified_at IS NOT NULL AND tc.revoked_at IS NULL) AS shared`;
  for (const s of paused) {
    await sql`INSERT INTO notifications (user_id, kind, title, body, href) VALUES (${s.user_id}, 'location_paused', 'Your live location paused',
      ${s.shared ? "Your contacts are seeing your last spot. Open MIRA to keep sharing — I'll still check in at your ETA." : "Open MIRA to keep your trip live — I'll still check in at your ETA."}, '/trip')`;
    log("trip.location_stale", { journey: s.id });
  }
  result.staleNudged = paused.length;

  // Contacts who were told "missed" are told once the person checks in, so nobody is left worrying.
  if (mailer) {
    const arrived = await sql<{ id: string; owner: string; dest_name: string | null }[]>`
      UPDATE journeys j SET arrived_notice_at = ${now} FROM users u
      WHERE u.id = j.user_id AND j.state = 'arrived' AND EXISTS (SELECT 1 FROM trip_contacts tc WHERE tc.journey_id = j.id AND tc.alert_delivery = 'sent' AND tc.revoked_at IS NULL) AND j.arrived_notice_at IS NULL
      RETURNING j.id, u.name AS owner, j.dest_name`;
    for (const j of arrived) {
      try {
        const contacts = await sql<{ encrypted_email: string }[]>`
          SELECT c.encrypted_email FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id WHERE tc.journey_id = ${j.id} AND c.accepted_at IS NOT NULL AND tc.revoked_at IS NULL AND tc.alert_delivery = 'sent'`;
        const mail = tripArrivedEmail({ ownerName: j.owner.split(" ")[0], destination: j.dest_name ?? "their destination" });
        for (const c of contacts) await mailer.send({ to: decryptText(c.encrypted_email, "contact_email"), ...mail });
        result.arrivedNotices += 1;
      } catch (err) {
        log("journey.arrived_notice_failed", { journey: j.id, error: errName(err) });
      }
    }
  }

  const purged = await sql`DELETE FROM journeys WHERE purge_at <= ${now}`;
  result.purged = purged.count;
  if (purged.count) log("journey.purged", { count: purged.count });

  // Proof of a completed pass: readiness (and trip start) depend on this, not just on the process being alive.
  await recordHeartbeat(sql, JOURNEYS_JOB_ID, now, "journeys", now);
  return result;
}
