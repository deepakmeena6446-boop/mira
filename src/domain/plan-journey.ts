import type { MovementIntent } from "./plan-contract";
import { instantForLocal, type PlanOption } from "./plan-options";
import { resolvedDestination, resolvedOrigin } from "./plan-state";
import { haversineMeters } from "./pilot";

/** A future or remote plan is never silently converted into a trip from current GPS. */
export function planStartEligibility(plan: MovementIntent, option: PlanOption | null, fix: { lat: number; lon: number; accuracy: number; at: number } | null, now: number): { ok: true } | { ok: false; reason: string } {
  if (plan.loop || plan.mode !== "walk" || !resolvedDestination(plan) || !resolvedOrigin(plan) || !option || option.geometry.length < 2 || option.minutes < 1 || option.minutes > 240) return { ok: false, reason: "Choose a mapped walking option with two resolved places first." };
  const start = option.geometry[0];
  const end = option.geometry.at(-1)!;
  if (haversineMeters(resolvedOrigin(plan)!, { lat: start[1], lon: start[0] }) > 250 || haversineMeters(resolvedDestination(plan)!, { lat: end[1], lon: end[0] }) > 250) return { ok: false, reason: "The mapped path does not connect closely enough to the chosen places. Review access before starting." };
  const planned = instantForLocal(plan.departure.local, plan.departure.timeZone);
  if (!planned) return { ok: false, reason: "Check the planned time and time zone before starting." };
  if (Math.abs(planned.getTime() - now) > 30 * 60_000) return { ok: false, reason: "This plan is for another time. Edit its departure to now before starting." };
  if (!fix || now - fix.at > 30_000 || fix.at > now || fix.accuracy > 100) return { ok: false, reason: "A recent, accurate device position is needed to start. Try location again." };
  if (haversineMeters(resolvedOrigin(plan)!, fix) > Math.max(150, fix.accuracy * 2)) return { ok: false, reason: "You are not near the planned starting place. Edit the origin or move there before starting." };
  return { ok: true };
}

/** A loop without mapped geometry can only use a manual, check-in-only journey. */
export function loopCheckInEligibility(plan: MovementIntent, fix: { lat: number; lon: number; accuracy: number; at: number } | null, now: number): { ok: true } | { ok: false; reason: string } {
  const origin = resolvedOrigin(plan);
  if (!plan.loop || plan.mode !== "walk" || !origin) return { ok: false, reason: "Choose a walking loop with a resolved starting place first." };
  const planned = instantForLocal(plan.departure.local, plan.departure.timeZone);
  if (!planned) return { ok: false, reason: "Check the planned time and time zone before starting." };
  if (Math.abs(planned.getTime() - now) > 30 * 60_000) return { ok: false, reason: "This plan is for another time. Edit its departure to now before starting." };
  if (!fix || now - fix.at > 30_000 || fix.at > now || fix.accuracy > 100) return { ok: false, reason: "A recent, accurate device position is needed to start. Try location again." };
  if (haversineMeters(origin, fix) > Math.max(150, fix.accuracy * 2)) return { ok: false, reason: "You are not near the planned starting place. Edit the origin or move there before starting." };
  return { ok: true };
}
