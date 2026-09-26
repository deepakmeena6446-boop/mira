import { daypartFor, type Daypart } from "@/domain/daypart";

/**
 * Her local time, from the device: the instant it sent, read in its IANA time zone when it
 * sent one (and it's valid), else shifted by its UTC offset. Pure (no server-only), so the
 * evaluation script can use it too.
 */
export interface MiraClock {
  hour: number;
  minute: number;
  /** English weekday name, e.g. "Friday". */
  weekday: string;
  /** 0 = Monday … 6 = Sunday (domain/opening-hours LocalTime). */
  isoDay: number;
  /** IANA zone when the device gave a valid one, else null. */
  timeZone: string | null;
  daypart: Daypart;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A syntactically plausible IANA name that this runtime actually knows. */
export function validTimeZone(tz: string | null | undefined): string | null {
  if (!tz || tz.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export function localClock(ctx: { localTime: string; tzOffsetMin: number; tz?: string | null }): MiraClock {
  const at = new Date(ctx.localTime);
  const tz = validTimeZone(ctx.tz);
  let hour: number;
  let minute: number;
  let dow: number; // 0 = Sunday
  if (tz) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", weekday: "long", hourCycle: "h23" })
        .formatToParts(at)
        .map((p) => [p.type, p.value]),
    );
    hour = Number(parts.hour) % 24;
    minute = Number(parts.minute);
    dow = WEEKDAYS.indexOf(parts.weekday);
  } else {
    const shifted = new Date(at.getTime() - ctx.tzOffsetMin * 60_000);
    hour = shifted.getUTCHours();
    minute = shifted.getUTCMinutes();
    dow = shifted.getUTCDay();
  }
  return { hour, minute, weekday: WEEKDAYS[dow] ?? "", isoDay: (dow + 6) % 7, timeZone: tz, daypart: daypartFor(hour) };
}

/** "10:05 pm" */
export function clock12(hour: number, minute: number): string {
  return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}
