/**
 * Opening hours, deterministically. A strict parser for the common OpenStreetMap
 * `opening_hours` forms ("Mo-Sa 09:00-21:00; Su 10:00-14:00", "24/7", "Mo-Fr 09:00-13:00,14:00-18:00",
 * "22:00-02:00", "Su off"). Anything it doesn't fully understand returns null: hours stay
 * "not known" rather than guessed. Public-holiday rules ("PH off") are ignored, which is why
 * the UI always says these are *listed* hours, with their source.
 */

/** 0 = Monday … 6 = Sunday. Minutes from local midnight; `to` may exceed 1440 (past midnight). */
export interface Period {
  day: number;
  from: number;
  to: number;
}
export type Schedule = Period[] | "24/7";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): Array<[number, number]> | null {
  const out: Array<[number, number]> = [];
  for (const part of spec.split(",")) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) return null;
    const from = +m[1] * 60 + +m[2];
    let to = +m[3] * 60 + +m[4];
    if (+m[1] > 24 || +m[3] > 48 || +m[2] > 59 || +m[4] > 59 || from > 1440) return null;
    if (to <= from) to += 1440; // past midnight
    out.push([from, to]);
  }
  return out;
}

export function parseOpeningHours(raw: string | null | undefined): Schedule | null {
  const text = (raw ?? "").trim();
  if (!text || text.length > 200) return null;
  if (/^24\/7$/.test(text)) return "24/7";
  const byDay = new Map<number, Array<[number, number]>>();
  let any = false;
  for (const ruleRaw of text.split(";")) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    if (/^PH\b/.test(rule)) continue; // public holidays: not modelled (see header)
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    const rest = m[2].trim();
    if (!days) return null;
    let times: Array<[number, number]>;
    if (/^(off|closed)$/i.test(rest)) times = [];
    else if (rest === "00:00-24:00" || rest === "24/7") times = [[0, 1440]];
    else {
      const t = parseTimes(rest);
      if (!t) return null; // sunrise, months, week numbers, comments…: don't guess
      times = t;
    }
    for (const d of days) byDay.set(d, times); // a later rule replaces earlier ones for its days
    any = true;
  }
  if (!any) return null;
  const periods: Period[] = [];
  for (const [day, ts] of byDay) for (const [from, to] of ts) periods.push({ day, from, to });
  return periods;
}

export interface LocalTime {
  /** 0 = Monday … 6 = Sunday */
  day: number;
  minute: number;
}

export function localTime(d: Date): LocalTime {
  return { day: (d.getDay() + 6) % 7, minute: d.getHours() * 60 + d.getMinutes() };
}

/** Place-local clock; an unavailable/invalid zone cannot establish listed-open hours. */
export function localTimeInZone(date: Date, timeZone: string | null | undefined): LocalTime | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday") ?? "");
    const hour = Number(get("hour")), minute = Number(get("minute"));
    return day >= 0 && Number.isFinite(hour) && Number.isFinite(minute) ? { day, minute: hour * 60 + minute } : null;
  } catch { return null; }
}

export type OpenState =
  | { state: "open"; closesAt: number | null } // closesAt: minutes from local midnight today (may exceed 1440), null = 24h
  | { state: "closing"; closesAt: number } // open now, but closes before she'd get there
  | { state: "closed" }
  | { state: "unknown" };

/** Is it open now, and still when she'd arrive (`arriveInMin`)? */
export function openState(schedule: Schedule | null | undefined, now: LocalTime, arriveInMin = 0): OpenState {
  if (!schedule) return { state: "unknown" };
  if (schedule === "24/7") return { state: "open", closesAt: null };
  const yesterday = (now.day + 6) % 7;
  // Periods covering "now", expressed on today's clock.
  const covering = schedule
    .map((p) => (p.day === now.day ? p : p.day === yesterday && p.to > 1440 ? { day: now.day, from: p.from - 1440, to: p.to - 1440 } : null))
    .filter((p): p is Period => p !== null && p.from <= now.minute && now.minute < p.to);
  if (!covering.length) return { state: "closed" };
  let closesAt = Math.max(...covering.map((p) => p.to));
  // Runs on into a period that starts exactly when this one ends — later today, or on the
  // following days (e.g. "Mo-Su 00:00-24:00" is open around the clock).
  for (let k = 0; k <= 7; k++) {
    const d = (now.day + k) % 7;
    const next = schedule.find((p) => p.day === d && p.from + k * 1440 === closesAt);
    if (!next) {
      if (k === 0) continue;
      break;
    }
    closesAt = next.to + k * 1440;
    if (k === 0) k = -1; // a same-day continuation may itself continue: check today again
  }
  if (closesAt - now.minute >= 7 * 1440 - 1) return { state: "open", closesAt: null };
  if (now.minute + arriveInMin >= closesAt) return { state: "closing", closesAt };
  return { state: "open", closesAt };
}

/**
 * When the listed period she is in now began, on today's clock (negative = it began yesterday
 * evening), or null when the listed hours don't cover this moment. For "Listed 9 AM–9 PM".
 */
export function openedAt(schedule: Schedule | null | undefined, now: LocalTime): number | null {
  if (!schedule || schedule === "24/7") return null;
  const yesterday = (now.day + 6) % 7;
  const starts = schedule
    .map((p) => (p.day === now.day ? p : p.day === yesterday && p.to > 1440 ? { day: now.day, from: p.from - 1440, to: p.to - 1440 } : null))
    .filter((p): p is Period => p !== null && p.from <= now.minute && now.minute < p.to)
    .map((p) => p.from);
  return starts.length ? Math.min(...starts) : null;
}

/** "9 AM", "9:30 PM", "12 AM" (midnight): the form used in listed-hours copy. Deterministic, device-independent. */
export function clock12(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function clockLabel(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Google Places `regularOpeningHours.periods` (day 0 = Sunday) → Schedule. A single period
 * that opens Sunday 00:00 with no close means open 24 hours.
 */
export function scheduleFromGoogle(periods: Array<{ open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }> | undefined): Schedule | null {
  if (!periods?.length) return null;
  if (periods.length === 1 && periods[0].open && !periods[0].close) return "24/7";
  const out: Period[] = [];
  for (const p of periods) {
    if (!p.open || !p.close) return null;
    const day = (p.open.day + 6) % 7;
    const from = p.open.hour * 60 + p.open.minute;
    const closeDay = (p.close.day + 6) % 7;
    let to = p.close.hour * 60 + p.close.minute + ((closeDay - day + 7) % 7) * 1440;
    if (to <= from) to += 1440;
    out.push({ day, from, to });
  }
  return out;
}
