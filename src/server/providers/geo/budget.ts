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
/** A day's ceiling too: 600/min alone would still allow ~860k calls a day from one busy process. */
const DEFAULT_PER_DAY = 20_000;
let windowStart = 0;
let used = 0;
let day = "";
let usedToday = 0;
let loggedDay = "";

export function takeGoogleCall(now = Date.now()): boolean {
  const env = getEnv();
  const max = Number(env.GOOGLE_MAX_CALLS_PER_MIN ?? DEFAULT_PER_MIN);
  const maxDay = Number(env.GOOGLE_MAX_CALLS_PER_DAY ?? DEFAULT_PER_DAY);
  if (now - windowStart >= 60_000) {
    windowStart = now;
    used = 0;
  }
  const today = new Date(now).toISOString().slice(0, 10); // UTC day
  if (today !== day) {
    day = today;
    usedToday = 0;
  }
  if (usedToday >= maxDay) {
    if (loggedDay !== today) {
      loggedDay = today;
      console.warn(JSON.stringify({ t: new Date(now).toISOString(), src: "web", event: "geo.google_daily_budget_reached", max: maxDay }));
    }
    return false;
  }
  if (used >= max) return false;
  used += 1;
  usedToday += 1;
  return true;
}

/** Thrown inside the Google adapter so its normal fallback path takes over. */
export class GoogleBudgetExceeded extends Error {
  name = "GoogleBudgetExceeded";
}

export function resetGoogleBudget() {
  windowStart = 0;
  used = 0;
  day = "";
  usedToday = 0;
  loggedDay = "";
}
