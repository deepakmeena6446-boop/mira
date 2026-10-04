import type postgres from "postgres";
import { ALERT_UNCONFIRMED_AFTER_MS, EXPIRE_AFTER_ETA_MS, LINK_AFTER_ALERT_MS, MISS_GRACE_MS, dueTransition, purgeAt, type JourneyState } from "@/domain/journey";
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

/** A claim older than this with contacts never attempted is picked up by the next pass (the claiming pass died). */
export const ALERT_RETRY_AFTER_MS = 60_000;

/**
 * The missed-check-in email for each accepted contact on an account journey. `onlyClaimed`: just the contacts
 * no pass has attempted yet (a retry after a pass died) — anyone already sent, failed or cut off mid-send is left alone.
 */
async function accountAlertSends(q: postgres.Sql, j: { id: string; user_id: string; dest_name: string | null; eta_at: Date; tz: string | null }, now: Date, onlyClaimed: boolean): Promise<PendingAlert["sends"]> {
  const contacts = await q<{ contact_id: string; name: string; encrypted_email: string; share_token_enc: string | null }[]>`
    SELECT c.id AS contact_id, c.name, c.encrypted_email, tc.share_token_enc FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id
    WHERE tc.journey_id = ${j.id} AND c.accepted_at IS NOT NULL AND tc.revoked_at IS NULL ${onlyClaimed ? q`AND tc.alert_delivery = 'claimed'` : q``} ORDER BY c.name`;
  const owner = ((await q<{ name: string }[]>`SELECT name FROM users WHERE id = ${j.user_id}`)[0]?.name ?? "Your contact").split(" ")[0];
  const minutesLate = Math.max(1, Math.round((now.getTime() - new Date(j.eta_at).getTime()) / 60_000));
  return contacts.map((c) => ({
    contactId: c.contact_id,
    name: c.name,
    email: decryptText(c.encrypted_email, "contact_email"),
    message: tripMissedEmail({ ownerName: owner, destination: j.dest_name ?? "their destination", minutesLate, liveUrl: liveUrl(c.share_token_enc), etaAt: new Date(j.eta_at), tz: j.tz }),
  }));
}

/**
 * Send one contact's alert at most once. The contact is taken claimed → sending first; a second worker (or a
 * retry racing a slow pass) finds it already taken and skips it. Returns null when someone else has it.
 */
async function sendOneAlert(sql: postgres.Sql, mailer: Mailer, journeyId: string, s: PendingAlert["sends"][number]): Promise<"sent" | "failed" | "unconfirmed" | null> {
  const [taken] = await sql`UPDATE trip_contacts tc SET alert_delivery = 'sending' FROM journeys j
    WHERE tc.journey_id = ${journeyId} AND tc.contact_id = ${s.contactId} AND tc.revoked_at IS NULL AND tc.alert_delivery = 'claimed'
      AND j.id = tc.journey_id AND j.state = 'missed' RETURNING 1`;
  if (!taken) return null;
  const res = await mailer.send({ to: s.email, ...s.message }).catch(() => ({ ok: false, definite: false }));
  const delivery = res.ok ? "sent" : res.definite ? "failed" : "unconfirmed";
  // A retry may already have called a long-running send unconfirmed; a real outcome still replaces that.
  await sql`UPDATE trip_contacts SET alert_delivery = ${delivery} WHERE journey_id = ${journeyId} AND contact_id = ${s.contactId} AND alert_delivery IN ('sending', 'unconfirmed')`;
  return delivery;
}

/**
 * The journey's alert outcome, from what each contact on it got. Null while any contact is still to be
 * attempted or mid-send (the claim stays open for the next pass).
 */
async function settleAccountAlert(sql: postgres.Sql, journeyId: string, stillMissed = false): Promise<"sent" | "failed" | "unconfirmed" | null> {
  const rows = await sql<{ d: string }[]>`SELECT alert_delivery AS d FROM trip_contacts
    WHERE journey_id = ${journeyId} AND revoked_at IS NULL AND alert_delivery IN ('claimed', 'sending', 'sent', 'failed', 'unconfirmed')`;
  if (rows.some((r) => r.d === "claimed" || r.d === "sending")) return null;
  if (!rows.length) {
    if (stillMissed) {
      // She was told "I'm emailing…" at the miss and nothing can confirm it went: unconfirmed, never "not attempted".
      await sql`UPDATE journeys SET alert_state = 'unconfirmed' WHERE id = ${journeyId} AND alert_state = 'claimed'`;
      return "unconfirmed";
    }
    // She arrived or ended before anyone was attempted: no alert went out (and none should).
    await sql`UPDATE journeys SET alert_state = 'not_attempted' WHERE id = ${journeyId} AND alert_state = 'claimed'`;
    return null;
  }
  const outcome = rows.length && rows.every((r) => r.d === "sent") ? "sent" : rows.some((r) => r.d === "sent" || r.d === "unconfirmed") ? "unconfirmed" : "failed";
  await sql`UPDATE journeys SET alert_state = ${outcome} WHERE id = ${journeyId} AND alert_state = 'claimed'`;
  return outcome;
}

/**
 * One worker pass (architecture §6). Each due journey is handled in its own transaction
 * under a row lock (FOR UPDATE SKIP LOCKED), so a racing user action and the worker can't
 * both win, and one bad row can't stall every other alert. The alert attempt is *claimed*
 * in the same transaction as the miss; the SMTP send happens once, after commit. A crash
 * after the claim leaves it "claimed": on an account journey a later pass sends each contact
 * nobody attempted (taken claimed → sending, so never twice); one cut off mid-send is unconfirmed.
 */
export async function processJourneys(sql: postgres.Sql, clock: Clock, mailer: Mailer | null, log: Log = () => {}): Promise<JourneyTickResult> {
  const now = clock.now();
  const result: JourneyTickResult = { staleNudged: 0, missed: 0, expired: 0, alertsSent: 0, alertsFailed: 0, alertsUnconfirmed: 0, arrivedNotices: 0, failedJourneys: 0, purged: 0 };

  // A claim the claiming pass never finished (the worker died or was stopped mid-pass). On an account journey,
  // contacts nobody attempted are sent now — a missed alert must not be lost to a deploy. A contact cut off
  // mid-send may already have it, so it is called unconfirmed and never sent twice.
  const retry = await sql<{ id: string; user_id: string; state: JourneyState; dest_name: string | null; eta_at: Date; tz: string | null; claimed_at: Date }[]>`
    SELECT id, user_id, state, dest_name, eta_at, tz, alert_claimed_at AS claimed_at FROM journeys
    WHERE alert_state = 'claimed' AND user_id IS NOT NULL AND alert_claimed_at < ${new Date(now.getTime() - ALERT_RETRY_AFTER_MS)}`;
  for (const j of retry) {
    try {
      if (j.state === "missed" && mailer) {
        const sends = await accountAlertSends(sql, j, now, true);
        for (const s of sends) await sendOneAlert(sql, mailer, j.id, s);
        if (sends.length) log("journey.alert_retried", { journey: j.id, recipients: sends.length });
      } else {
        // She arrived or ended before anyone was attempted (no alert after arrival), or email is gone.
        await sql`UPDATE trip_contacts SET alert_delivery = 'not_attempted' WHERE journey_id = ${j.id} AND alert_delivery = 'claimed'`;
      }
      const stale = now.getTime() - new Date(j.claimed_at).getTime() > ALERT_UNCONFIRMED_AFTER_MS;
      const cutOff = stale
        ? await sql<{ name: string }[]>`UPDATE trip_contacts tc SET alert_delivery = 'unconfirmed' FROM contacts c
            WHERE tc.journey_id = ${j.id} AND tc.contact_id = c.id AND tc.alert_delivery = 'sending' AND tc.revoked_at IS NULL RETURNING c.name`
        : [];
      if (cutOff.length) await notifyAlertUncertain(sql, j.user_id, joinNames(cutOff.map((c) => c.name)));
      const outcome = await settleAccountAlert(sql, j.id, j.state === "missed" && (stale || !mailer));
      if (outcome === "unconfirmed" && !cutOff.length) await notifyAlertUncertain(sql, j.user_id, "your contacts");
      if (outcome === "sent") result.alertsSent += 1;
      else if (outcome === "failed") result.alertsFailed += 1;
      else if (outcome === "unconfirmed") result.alertsUnconfirmed += 1;
      if (outcome) log("journey.alert", { journey: j.id, outcome, recovered: true });
    } catch (err) {
      result.failedJourneys += 1;
      log("journey.alert_failed", { journey: j.id, error: errName(err) });
    }
  }
  // A legacy (no-account) claim has no per-contact record to resume from: say so, never leave "I'm emailing…" standing.
  const stale = await sql<{ id: string }[]>`
    UPDATE journeys SET alert_state = 'unconfirmed'
    WHERE alert_state = 'claimed' AND user_id IS NULL AND alert_claimed_at < ${new Date(now.getTime() - ALERT_UNCONFIRMED_AFTER_MS)}
    RETURNING id`;
  result.alertsUnconfirmed += stale.length;
  for (const j of stale) log("journey.alert", { journey: j.id, outcome: "unconfirmed", recipients: 0 });

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
        const [j] = await tx<{ id: string; state: JourneyState; eta_at: Date; contact_state: string; place_id: string | null; dest_name: string | null; user_id: string | null; tz: string | null; alert_state: string; alert_claimed_at: Date | null }[]>`
          SELECT id, state, eta_at, contact_state, place_id, dest_name, user_id, tz, alert_state, alert_claimed_at FROM journeys WHERE id = ${id} FOR UPDATE SKIP LOCKED`;
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
        // at least one pass with a working link after the alert — and never while an alert is still owed.
        // A late worker used to alert and expire ~30 s apart; the link now lives LINK_AFTER_ALERT_MS past the alert (audit L06-002).
        const expiresAt = Math.max(new Date(j.eta_at).getTime() + EXPIRE_AFTER_ETA_MS, j.alert_claimed_at ? new Date(j.alert_claimed_at).getTime() + LINK_AFTER_ALERT_MS : 0);
        if (j.state === "missed" && j.alert_state !== "claimed" && now.getTime() >= expiresAt) {
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
      if (a.userId && mailer) {
        // Account journeys: each contact is taken once (claimed → sending) so a later pass can resume a pass that died.
        const outcomes = new Map<string, "sent" | "failed" | "unconfirmed" | null>();
        for (const s of a.sends) outcomes.set(s.contactId!, await sendOneAlert(sql, mailer, a.journeyId, s));
        await sql`UPDATE trip_contacts SET alert_delivery = 'not_attempted' WHERE journey_id = ${a.journeyId} AND alert_delivery = 'claimed' AND revoked_at IS NOT NULL`;
        const outcome = await settleAccountAlert(sql, a.journeyId);
        const notConfirmed = a.sends.filter((s) => { const o = outcomes.get(s.contactId!); return o === "failed" || o === "unconfirmed"; }).map((s) => s.name);
        if (notConfirmed.length) await notifyAlertUncertain(sql, a.userId, joinNames(notConfirmed));
        if (outcome === "sent") result.alertsSent += 1;
        else if (outcome === "failed") result.alertsFailed += 1;
        else if (outcome === "unconfirmed") result.alertsUnconfirmed += 1;
        log("journey.alert", { journey: a.journeyId, outcome: outcome ?? "pending", recipients: a.sends.length, unconfirmed: notConfirmed.length });
        continue;
      }
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
      // Left "claimed": a later pass sends anyone not yet attempted (account journeys) or reports it unconfirmed.
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

  // Contacts who were told "missed" are told once it's over — she checked in, or ended the trip herself — so nobody is
  // left worrying (audit P02-003). Including anyone she removed from the trip after the alert: they were told, so they
  // hear the end too (no location, no link).
  if (mailer) {
    const arrived = await sql<{ id: string; owner: string; dest_name: string | null; state: JourneyState }[]>`
      UPDATE journeys j SET arrived_notice_at = ${now} FROM users u
      WHERE u.id = j.user_id AND j.state IN ('arrived', 'ended') AND EXISTS (SELECT 1 FROM trip_contacts tc WHERE tc.journey_id = j.id AND tc.alert_delivery = 'sent') AND j.arrived_notice_at IS NULL
      RETURNING j.id, u.name AS owner, j.dest_name, j.state`;
    for (const j of arrived) {
      try {
        const contacts = await sql<{ encrypted_email: string }[]>`
          SELECT c.encrypted_email FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id WHERE tc.journey_id = ${j.id} AND c.accepted_at IS NOT NULL AND tc.alert_delivery = 'sent'`;
        const mail = tripArrivedEmail({ ownerName: j.owner.split(" ")[0], destination: j.dest_name ?? "their destination", ended: j.state === "ended" });
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
