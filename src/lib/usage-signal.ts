/**
 * Device-local usage signal (docs/launch-ux/07 §B). It decides only how Home's *adaptive*
 * surfaces are ordered (journey-first vs contribution-first); stable anchors never move.
 *
 * Privacy: each event is a kind + her local date — no time, place, id or text. It never leaves the
 * phone (not sent to MIRA, not in URLs), is listed in Me → What Mira remembers and /privacy, and is
 * cleared by "Reset how Mira arranges Home", sign-out and account deletion.
 */

export type UsageKind = "journey" | "report" | "check" | "correction" | "lit" | "mira";
export type UsageMode = "cold" | "journey" | "contribute" | "mixed";

interface Stored {
  v: 1;
  events: Array<[UsageKind, string]>;
  mode?: UsageMode;
  modeDay?: string;
}

export const USAGE_KEY = "mira.usage.v1";
export const SEEN_VERIFIED_KEY = "mira.seen.verified";
export const SEEN_SCOUT_KEY = "mira.seen.scout";
export const ARRIVAL_REMEMBER_KEY = "mira.arrival-remember-shown";
/** Every device-local key the reset clears. */
export const LOCAL_PERSONALISATION_KEYS = [USAGE_KEY, SEEN_VERIFIED_KEY, SEEN_SCOUT_KEY, ARRIVAL_REMEMBER_KEY] as const;

const MAX_EVENTS = 60;
const MAX_AGE_DAYS = 60;
const HALF_LIFE_DAYS = 21;

/** Local calendar date, YYYY-MM-DD. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const ageDays = (day: string, now: Date) => (new Date(`${localDay(now)}T00:00:00`).getTime() - new Date(`${day}T00:00:00`).getTime()) / 86_400_000;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(s: Storage | null): Stored {
  try {
    const raw = s?.getItem(USAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    return v && v.v === 1 && Array.isArray(v.events) ? v : { v: 1, events: [] };
  } catch {
    return { v: 1, events: [] };
  }
}

function write(s: Storage | null, v: Stored) {
  try {
    s?.setItem(USAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage full or blocked: adaptation just stays at its default */
  }
}

/** Keep the last 60 events from the last 60 days. */
function prune(events: Stored["events"], now: Date): Stored["events"] {
  return events.filter(([, day]) => ageDays(day, now) <= MAX_AGE_DAYS).slice(-MAX_EVENTS);
}

/** Record a successful action (call only after the API confirmed it). */
export function recordUsage(kind: UsageKind, now = new Date(), s: Storage | null = storage()) {
  const v = read(s);
  v.events = prune([...v.events, [kind, localDay(now)]], now);
  write(s, v);
}

/**
 * The mode from recency-weighted counts (half-life 21 days), with hysteresis. Pure — exported for tests.
 * cold: < 3 events · journey: J ≥ 2C (2.5C to switch in) and J ≥ 2 · contribute: the mirror · else mixed.
 */
export function computeMode(events: Stored["events"], now: Date, previous: UsageMode | undefined): UsageMode {
  const live = prune(events, now).filter(([k]) => k !== "mira");
  if (live.length < 3) return "cold";
  const w = (day: string) => 0.5 ** (ageDays(day, now) / HALF_LIFE_DAYS);
  let j = 0;
  let c = 0;
  for (const [k, day] of live) {
    if (k === "journey") j += w(day);
    else c += w(day);
  }
  const ratio = (a: number, b: number) => (b === 0 ? Infinity : a / b);
  const need = (target: UsageMode) => (previous === target ? 1.5 : previous === "journey" || previous === "contribute" ? 2.5 : 2);
  if (j >= 2 && ratio(j, c) >= need("journey")) return "journey";
  if (c >= 2 && ratio(c, j) >= need("contribute")) return "contribute";
  return "mixed";
}

/**
 * The mode shown today. Recomputed only when her local date changes, so the arrangement never
 * shifts while she's using the app (docs/launch-ux/02 C-6.4).
 */
export function usageMode(now = new Date(), s: Storage | null = storage()): UsageMode {
  const v = read(s);
  const today = localDay(now);
  if (v.mode && v.modeDay === today) return v.mode;
  const mode = computeMode(v.events, now, v.mode);
  write(s, { ...v, events: prune(v.events, now), mode, modeDay: today });
  return mode;
}

/** How many journeys she started lately (for "Add someone who should know you got there"). */
export function journeysStarted(now = new Date(), s: Storage | null = storage()): number {
  return prune(read(s).events, now).filter(([k]) => k === "journey").length;
}

export function readNumber(key: string, s: Storage | null = storage()): number | null {
  try {
    const raw = s?.getItem(key);
    return raw === null || raw === undefined ? null : Number(raw);
  } catch {
    return null;
  }
}

export function writeValue(key: string, value: string, s: Storage | null = storage()) {
  try {
    s?.setItem(key, value);
  } catch {
    /* best effort */
  }
}

/** "Reset how Mira arranges Home" — and part of sign-out / delete. */
export function resetLocalPersonalisation(s: Storage | null = storage()) {
  for (const k of LOCAL_PERSONALISATION_KEYS) {
    try {
      s?.removeItem(k);
    } catch {
      /* best effort */
    }
  }
}
