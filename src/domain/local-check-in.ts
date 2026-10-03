import type { MovementIntent } from "./plan-contract";
import { instantForLocal } from "./plan-options";
import { resolvedOrigin } from "./plan-state";

/** A private tab timer for a loop without GPS, account, route or worker monitoring. */
export type LocalCheckIn = { version: 1; startedAt: number; dueAt: number };
export const LOCAL_CHECK_IN_KEY = "mira.local-check-in.v1";
export const LOCAL_CHECK_IN_GRACE_MS = 30 * 60_000;

export function localLoopEligibility(plan: MovementIntent, now: number): { ok: true } | { ok: false; reason: string } {
  if (!plan.loop || plan.mode !== "walk" || !resolvedOrigin(plan)) return { ok: false, reason: "Choose a walking loop with a resolved starting place first." };
  const planned = instantForLocal(plan.departure.local, plan.departure.timeZone);
  if (!planned) return { ok: false, reason: "Check the planned time and time zone before starting." };
  if (Math.abs(planned.getTime() - now) > 30 * 60_000) return { ok: false, reason: "This plan is for another time. Edit its departure to now before starting." };
  return { ok: true };
}

export function createLocalCheckIn(minutes: number, now: number): LocalCheckIn | null {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 235 || !Number.isFinite(now)) return null;
  return { version: 1, startedAt: now, dueAt: now + minutes * 60_000 };
}

export function parseLocalCheckIn(raw: string | null, now: number): LocalCheckIn | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as LocalCheckIn;
    if (value.version !== 1 || !Number.isSafeInteger(value.startedAt) || !Number.isSafeInteger(value.dueAt)) return null;
    if (value.startedAt > now || value.dueAt - value.startedAt < 5 * 60_000 || value.dueAt - value.startedAt > 235 * 60_000 || now > value.dueAt + LOCAL_CHECK_IN_GRACE_MS) return null;
    return value;
  } catch { return null; }
}
