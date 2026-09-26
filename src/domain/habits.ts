import { modeWords, type JourneyModeName } from "@/domain/travel-prefs";

/**
 * Journey habits (pure). A habit is a count of finished journeys to one of HER SAVED places, by
 * one way of travelling, started in one local hour, plus who she shared it with last time.
 * Nothing here is inferred: a suggestion exists only when the history backs it, and it names
 * only people who are still her accepted contacts. No history → no suggestion (never fake memory).
 */
export interface Habit {
  placeId: string;
  mode: JourneyModeName;
  /** Local start hour, 0–23, from her phone. */
  startHour: number;
  times: number;
  /** Contact ids the last matching journey was shared with. */
  lastSharedWith: string[];
  /** Local day of the last matching journey, "YYYY-MM-DD". */
  lastDay: string;
}

export interface HabitPlace {
  id: string;
  label: string;
}

export interface HabitContact {
  id: string;
  name: string;
  accepted: boolean;
}

export interface HabitSuggestion {
  placeId: string;
  placeLabel: string;
  mode: JourneyModeName;
  /** Matching finished journeys (same place, same mode, started within ±1 h of now). */
  times: number;
  /** People to share with, as last time — only those still accepted in her circle. */
  shareWith: Array<{ id: string; name: string }>;
  text: string;
}

/** A suggestion needs at least this many matching finished journeys. */
export const HABIT_MIN_TIMES = 3;
/** "Around your usual time": start hour within this many hours of now (wrapping at midnight). */
export const HABIT_HOUR_WINDOW = 1;
/** Habits unused for this long are deleted (retention). */
export const HABIT_KEEP_DAYS = 400;

/** Distance between two hours on the 24-hour clock (23 and 0 are 1 apart). */
export function hourDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 24) + 24) % 24);
  return Math.min(d, 24 - d);
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** "around 9 pm", "around midnight", "around noon". */
export function hourWords(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "around midnight";
  if (h === 12) return "around noon";
  return `around ${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
}

/** "Home · walking · around 9 pm · 5 times" (Me → What MIRA remembers). */
export function describeHabit(h: Pick<Habit, "mode" | "startHour" | "times">, placeLabel: string): string {
  return `${placeLabel} · ${modeWords(h.mode).short} · ${hourWords(h.startHour)} · ${h.times} time${h.times === 1 ? "" : "s"}`;
}

/**
 * The one suggestion history supports right now, or null.
 * @param now her local hour (0–23), or a Date read in the runtime's local zone (on her phone).
 * @param opts.mode only consider this way of travelling (e.g. the mode she has picked).
 */
export function habitSuggestion(
  habits: readonly Habit[],
  now: number | Date,
  savedPlaces: readonly HabitPlace[],
  contacts: readonly HabitContact[],
  opts: { mode?: JourneyModeName; placeId?: string } = {},
): HabitSuggestion | null {
  const hour = typeof now === "number" ? now : now.getHours();
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const places = new Map(savedPlaces.map((p) => [p.id, p.label]));

  // Group matching rows by place + mode (one row per start hour), summing journeys within ±1 h.
  const groups = new Map<string, { placeId: string; mode: JourneyModeName; times: number; latest: Habit }>();
  for (const h of habits) {
    if (!places.has(h.placeId)) continue; // place deleted: its habits are gone too
    if (opts.mode && h.mode !== opts.mode) continue;
    if (opts.placeId && h.placeId !== opts.placeId) continue;
    if (!Number.isInteger(h.times) || h.times < 1) continue;
    if (hourDistance(h.startHour, hour) > HABIT_HOUR_WINDOW) continue;
    const key = `${h.placeId}|${h.mode}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { placeId: h.placeId, mode: h.mode, times: h.times, latest: h });
    else {
      g.times += h.times;
      // "Like usual" = the most recent matching journey; same day → the hour closest to now, then the more frequent.
      const cmp = h.lastDay.localeCompare(g.latest.lastDay) || hourDistance(g.latest.startHour, hour) - hourDistance(h.startHour, hour) || h.times - g.latest.times;
      if (cmp > 0) g.latest = h;
    }
  }

  const best = [...groups.values()]
    .filter((g) => g.times >= HABIT_MIN_TIMES)
    .sort((a, b) => b.times - a.times || b.latest.lastDay.localeCompare(a.latest.lastDay) || a.placeId.localeCompare(b.placeId))[0];
  if (!best) return null;

  const label = places.get(best.placeId)!;
  const accepted = new Map(contacts.filter((c) => c.accepted).map((c) => [c.id, c.name]));
  const shareWith = best.latest.lastSharedWith.filter((id, i, all) => accepted.has(id) && all.indexOf(id) === i).map((id) => ({ id, name: accepted.get(id)! }));
  const text = shareWith.length
    ? `You're heading to ${label} around your usual time. Share this journey with ${joinNames(shareWith.map((c) => c.name))} like usual?`
    : `Heading to ${label} around your usual time? Start the journey with MIRA.`;
  return { placeId: best.placeId, placeLabel: label, mode: best.mode, times: best.times, shareWith, text };
}
