/**
 * Journey state machine (architecture §6, product spec §7). Pure and clock-free.
 *
 *   active → arrived | ended               (user)
 *   active → missed                        (worker, at ETA + 10 min)
 *   missed → arrived | ended               (user)
 *   active | missed → expired              (worker, at ETA + 30 min)
 *   active → active (extend ETA once, before the miss, within 4 h of creation)
 * Terminal states never reopen.
 */
export type JourneyState = "active" | "missed" | "arrived" | "ended" | "expired";
export type ContactState = "none" | "invite_pending" | "invite_failed" | "accepted" | "revoked";
export type AlertState = "none" | "claimed" | "sent" | "failed" | "unconfirmed" | "not_attempted";

export const MIN_ETA_MS = 5 * 60_000;
export const MAX_JOURNEY_MS = 4 * 3600_000;
export const MISS_GRACE_MS = 10 * 60_000;
export const EXPIRE_AFTER_ETA_MS = 30 * 60_000;
/** Closed journeys are hard-deleted this long after closing (spec: within 24 h). */
export const PURGE_AFTER_CLOSE_MS = 6 * 3600_000;
/** A claimed alert with no recorded outcome after this long is shown as unconfirmed. */
export const ALERT_UNCONFIRMED_AFTER_MS = 5 * 60_000;
const CLOCK_SKEW_MS = 60_000;

export const OPEN_STATES: readonly JourneyState[] = ["active", "missed"];

export function isOpen(s: JourneyState): boolean {
  return s === "active" || s === "missed";
}

export function validateNewEta(now: Date, eta: Date): string | null {
  const d = eta.getTime() - now.getTime();
  if (!Number.isFinite(d)) return "Choose a valid arrival time.";
  if (d < MIN_ETA_MS - CLOCK_SKEW_MS) return "Your ETA must be at least 5 minutes from now.";
  if (d > MAX_JOURNEY_MS) return "Your ETA can be at most 4 hours from now.";
  return null;
}

export function validateExtension(j: { state: JourneyState; extended: boolean; etaAt: Date; createdAt: Date }, now: Date, newEta: Date): string | null {
  if (j.state !== "active") return "Only an active journey can be extended.";
  if (j.extended) return "The ETA can be extended only once.";
  if (now.getTime() >= j.etaAt.getTime() + MISS_GRACE_MS) return "The check-in was already missed.";
  if (newEta.getTime() <= j.etaAt.getTime()) return "The new ETA must be later than the current one.";
  if (newEta.getTime() < now.getTime() + MIN_ETA_MS - CLOCK_SKEW_MS) return "The new ETA must be at least 5 minutes from now.";
  if (newEta.getTime() > j.createdAt.getTime() + MAX_JOURNEY_MS) return "A journey can last at most 4 hours from when it started.";
  return null;
}

export type UserAction = "arrive" | "end";

export function userTransition(state: JourneyState, action: UserAction): { ok: true; next: JourneyState; changed: boolean } | { ok: false } {
  const target: JourneyState = action === "arrive" ? "arrived" : "ended";
  if (state === target) return { ok: true, next: state, changed: false }; // idempotent repeat
  if (isOpen(state)) return { ok: true, next: target, changed: true };
  return { ok: false };
}

/** What the worker should do with an open journey at `now`. */
export function dueTransition(j: { state: JourneyState; etaAt: Date }, now: Date): "miss" | "expire" | null {
  const t = now.getTime();
  const eta = j.etaAt.getTime();
  if (isOpen(j.state) && t >= eta + EXPIRE_AFTER_ETA_MS) return j.state === "active" ? "miss" : "expire";
  if (j.state === "active" && t >= eta + MISS_GRACE_MS) return "miss";
  return null;
}

export function purgeAt(closedAt: Date): Date {
  return new Date(closedAt.getTime() + PURGE_AFTER_CLOSE_MS);
}

export function displayAlertState(alert: AlertState, claimedAt: Date | null, now: Date): AlertState {
  if (alert === "claimed" && claimedAt && now.getTime() - claimedAt.getTime() > ALERT_UNCONFIRMED_AFTER_MS) return "unconfirmed";
  return alert;
}
