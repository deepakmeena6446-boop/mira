import "server-only";
import type postgres from "postgres";
import { HABIT_KEEP_DAYS, describeHabit, habitSuggestion, type Habit, type HabitSuggestion } from "@/domain/habits";
import { applyPrefsPatch, parseTravelPrefs, type JourneyModeName, type TravelPrefs, type TravelPrefsPatch } from "@/domain/travel-prefs";
import { dayIn } from "@/lib/time";

/**
 * Journey habits (blueprint §6, sprint contract "Privacy"): learned ONLY when a journey to one of
 * her saved places arrives, and only while "Learn from my finished journeys" is on. Stored: the
 * saved place, the way of travelling, the local start hour, a count, who she shared it with last
 * time, and the local day. Never coordinates, routes or times finer than the hour/day. She can
 * see every habit in Me, forget them all, or switch learning off (which forgets them too).
 */
type Db = postgres.Sql | postgres.TransactionSql;

/**
 * Called once, after a journey becomes `arrived` (manual "I'm here" or auto-arrival).
 * Returns true when a habit was counted. Journeys to places that aren't saved count nothing.
 */
export async function recordArrivalHabit(sql: Db, journeyId: string, now: Date): Promise<boolean> {
  const [j] = await sql<{ user_id: string; place_id: string; mode: JourneyModeName; start_hour: number; tz: string | null }[]>`
    SELECT j.user_id, j.saved_place_id AS place_id, j.mode, j.start_hour, j.tz
    FROM journeys j
    JOIN users u ON u.id = j.user_id AND u.remember_habits
    JOIN saved_places sp ON sp.id = j.saved_place_id AND sp.user_id = j.user_id
    WHERE j.id = ${journeyId} AND j.state = 'arrived' AND j.start_hour IS NOT NULL`;
  if (!j) return false;
  const shared = await sql<{ contact_id: string }[]>`SELECT contact_id FROM trip_contacts WHERE journey_id = ${journeyId} AND revoked_at IS NULL ORDER BY contact_id`;
  const ids = shared.map((s) => s.contact_id);
  const day = dayIn(now, j.tz);
  await sql`
    INSERT INTO journey_habits (user_id, place_id, mode, start_hour, times, last_shared_with, last_day)
    VALUES (${j.user_id}, ${j.place_id}, ${j.mode}, ${j.start_hour}, 1, ${sql.array(ids)}::uuid[], ${day}::date)
    ON CONFLICT (user_id, place_id, mode, start_hour) DO UPDATE
      SET times = journey_habits.times + 1, last_shared_with = EXCLUDED.last_shared_with, last_day = EXCLUDED.last_day`;
  return true;
}

export interface HabitView {
  placeId: string;
  placeLabel: string;
  emoji: string;
  mode: JourneyModeName;
  startHour: number;
  times: number;
  lastDay: string;
  /** "Home · walking · around 9 pm · 5 times" */
  text: string;
}

type HabitRow = { place_id: string; mode: JourneyModeName; start_hour: number; times: number; last_shared_with: string[]; last_day: string };

async function habitRows(sql: Db, userId: string): Promise<HabitRow[]> {
  return sql<HabitRow[]>`
    SELECT place_id, mode, start_hour, times, last_shared_with, to_char(last_day, 'YYYY-MM-DD') AS last_day
    FROM journey_habits WHERE user_id = ${userId}`;
}

const toHabit = (r: HabitRow): Habit => ({ placeId: r.place_id, mode: r.mode, startHour: r.start_hour, times: r.times, lastSharedWith: r.last_shared_with ?? [], lastDay: r.last_day });

/** Everything MIRA remembers, in words, most used first. */
export async function listHabits(sql: Db, userId: string): Promise<HabitView[]> {
  const rows = await sql<(HabitRow & { label: string; emoji: string })[]>`
    SELECT h.place_id, h.mode, h.start_hour, h.times, h.last_shared_with, to_char(h.last_day, 'YYYY-MM-DD') AS last_day, sp.label, sp.emoji
    FROM journey_habits h JOIN saved_places sp ON sp.id = h.place_id AND sp.user_id = h.user_id
    WHERE h.user_id = ${userId}
    ORDER BY h.times DESC, h.last_day DESC, sp.label, h.start_hour`;
  return rows.map((r) => ({
    placeId: r.place_id,
    placeLabel: r.label,
    emoji: r.emoji,
    mode: r.mode,
    startHour: r.start_hour,
    times: r.times,
    lastDay: r.last_day,
    text: describeHabit({ mode: r.mode, startHour: r.start_hour, times: r.times }, r.label),
  }));
}

/** Forget one remembered pattern (a place, a way of travelling, an hour); the rest stay. */
export async function forgetHabit(sql: Db, userId: string, key: { placeId: string; mode: JourneyModeName; startHour: number }): Promise<boolean> {
  const r = await sql`DELETE FROM journey_habits WHERE user_id = ${userId} AND place_id = ${key.placeId} AND mode = ${key.mode} AND start_hour = ${key.startHour}`;
  return r.count > 0;
}

export async function forgetHabits(sql: Db, userId: string): Promise<number> {
  const r = await sql`DELETE FROM journey_habits WHERE user_id = ${userId}`;
  return r.count;
}

/** The suggestion her history supports at this local hour, or null. */
export async function suggestionFor(sql: Db, userId: string, localHour: number, opts: { mode?: JourneyModeName } = {}): Promise<HabitSuggestion | null> {
  const [u] = await sql<{ remember_habits: boolean }[]>`SELECT remember_habits FROM users WHERE id = ${userId}`;
  if (!u?.remember_habits) return null;
  const rows = await habitRows(sql, userId);
  if (!rows.length) return null;
  const [places, contacts] = await Promise.all([
    sql<{ id: string; label: string }[]>`SELECT id, label FROM saved_places WHERE user_id = ${userId}`,
    sql<{ id: string; name: string; accepted: boolean }[]>`SELECT id, name, accepted_at IS NOT NULL AS accepted FROM contacts WHERE user_id = ${userId}`,
  ]);
  return habitSuggestion(rows.map(toHabit), localHour, places, contacts, opts);
}

export interface PersonalPrefs {
  prefs: TravelPrefs;
  rememberHabits: boolean;
  /** Old default-on preference is preserved for a one-time informed choice. */
  pausedLegacyHabits: boolean;
  /** Help Point classes she turned off (users.help_exclude, edited in Me → Help Points). Read-only here. */
  helpExclude: string[];
}

export async function getPrefs(sql: Db, userId: string): Promise<PersonalPrefs> {
  const [u] = await sql<{ travel_prefs: unknown; remember_habits: boolean; legacy_remember_habits: boolean; habit_choice_reviewed_at: Date | null; help_exclude: string[] | null }[]>`
    SELECT travel_prefs, remember_habits, legacy_remember_habits, habit_choice_reviewed_at, help_exclude FROM users WHERE id = ${userId}`;
  return {
    prefs: parseTravelPrefs(u?.travel_prefs),
    rememberHabits: u?.remember_habits ?? false,
    pausedLegacyHabits: Boolean(u?.legacy_remember_habits && !u.habit_choice_reviewed_at),
    helpExclude: u?.help_exclude ?? [],
  };
}

/** Update her preferences. Switching habit learning off forgets every habit in the same transaction. */
export async function updatePrefs(sql: postgres.Sql, userId: string, patch: TravelPrefsPatch): Promise<PersonalPrefs> {
  await sql.begin(async (tx) => {
    const [u] = await tx<{ travel_prefs: unknown }[]>`SELECT travel_prefs FROM users WHERE id = ${userId} FOR UPDATE`;
    if (patch.mode !== undefined || patch.shareByDefault !== undefined) {
      const next = applyPrefsPatch(parseTravelPrefs(u?.travel_prefs), patch);
      await tx`UPDATE users SET travel_prefs = ${tx.json(next as postgres.JSONValue)} WHERE id = ${userId}`;
    }
    if (patch.rememberHabits !== undefined) {
      await tx`UPDATE users SET remember_habits = ${patch.rememberHabits}, habit_choice_reviewed_at = now() WHERE id = ${userId}`;
      if (!patch.rememberHabits) await tx`DELETE FROM journey_habits WHERE user_id = ${userId}`;
    }
  });
  return getPrefs(sql, userId);
}

/** Retention: habits not used for over HABIT_KEEP_DAYS are deleted. */
export async function purgeStaleHabits(sql: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - HABIT_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const r = await sql`DELETE FROM journey_habits WHERE last_day < ${cutoff}::date`;
  return r.count;
}
