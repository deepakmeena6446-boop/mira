/**
 * IST time bands (architecture §5): day 06:00–18:00, evening 18:00–22:00,
 * late 22:00–06:00. Pure and clock-free.
 */
export type TimeBand = "day" | "evening" | "late";
export type TimeContext = "now" | "evening" | "late";

export const TIME_BAND_LABEL: Record<TimeBand, string> = {
  day: "daytime (06:00–18:00 IST)",
  evening: "evening (18:00–22:00 IST)",
  late: "late hours (22:00–06:00 IST)",
};

export const TIME_BAND_SHORT: Record<TimeBand, string> = { day: "Day", evening: "Evening", late: "Late" };

const IST_OFFSET_MIN = 330;

export function istHour(d: Date): number {
  const minutes = (d.getUTCHours() * 60 + d.getUTCMinutes() + IST_OFFSET_MIN) % 1440;
  return Math.floor(minutes / 60);
}

export function bandForDate(d: Date): TimeBand {
  const h = istHour(d);
  if (h >= 6 && h < 18) return "day";
  if (h >= 18 && h < 22) return "evening";
  return "late";
}

export function resolveTimeContext(ctx: TimeContext, now: Date): { band: TimeBand; fromNow: boolean } {
  if (ctx === "now") return { band: bandForDate(now), fromNow: true };
  return { band: ctx, fromNow: false };
}

/** Monday 00:00 IST of the week containing `d`, as a YYYY-MM-DD string (IST calendar). */
export function istWeekMonday(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

export function isIstMonday(d: Date): boolean {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return ist.getUTCDay() === 1;
}
