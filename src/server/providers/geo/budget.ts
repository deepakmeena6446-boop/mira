import "server-only";
import { getEnv } from "@/server/config/env";

/**
 * A per-process ceiling on paid Google Maps calls. Per-IP rate limits alone don't bound spend
 * (many addresses, uncacheable coordinates), so every Google request first takes a token here.
 * When the minute's budget is spent, the provider answers from its OpenStreetMap fallback
 * instead: maps get coarser for a moment, but search, routes and Help Points never stop.
 * Google Cloud quotas and budget alerts remain the hard backstop (ops).
 */
const DEFAULT_PER_MIN = 600;
let windowStart = 0;
let used = 0;

export function takeGoogleCall(now = Date.now()): boolean {
  const max = Number(getEnv().GOOGLE_MAX_CALLS_PER_MIN ?? DEFAULT_PER_MIN);
  if (now - windowStart >= 60_000) {
    windowStart = now;
    used = 0;
  }
  if (used >= max) return false;
  used += 1;
  return true;
}

/** Thrown inside the Google adapter so its normal fallback path takes over. */
export class GoogleBudgetExceeded extends Error {
  name = "GoogleBudgetExceeded";
}

export function resetGoogleBudget() {
  windowStart = 0;
  used = 0;
}
