import { daylightAt } from "./plan-options";
import type { LatLon } from "./pilot";

export type DaylightState = "daylight" | "dark" | "uncertain";
export interface DaylightOutlook {
  state: DaylightState;
  /** The next instant the calculated state changes (within 24 h), or null (polar day/night). */
  changeAt: Date | null;
  changeTo: DaylightState | null;
}

const STEP_MS = 5 * 60_000;

/**
 * Daylight now and when it next changes, from the same NOAA approximation the plan uses.
 * It is a calculation for open sky (weather, shade and street lighting excluded), labelled as one
 * wherever it is shown. Above 72° latitude the approximation is not used.
 */
export function daylightOutlook(at: Date, point: LatLon): DaylightOutlook | null {
  if (Math.abs(point.lat) > 72) return null;
  const state = daylightAt(at, point);
  for (let t = at.getTime() + STEP_MS; t <= at.getTime() + 24 * 3_600_000; t += STEP_MS) {
    const next = daylightAt(new Date(t), point);
    // "uncertain" is twilight: report the change into or out of it so copy can say "getting dark".
    if (next !== state) return { state, changeAt: new Date(t), changeTo: next };
  }
  return { state, changeAt: null, changeTo: null };
}

/**
 * "6:12 PM" in the given zone (or the device's when none is known). One clock everywhere (audit R14): always this
 * shape, never the device locale's "6:12 pm", "18:12" or native digits, so every screen, email and Mira agree.
 */
export function clockIn(at: Date | string | number, timeZone?: string | null): string {
  const d = at instanceof Date ? at : new Date(at);
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, numberingSystem: "latn", ...(timeZone ? { timeZone } : {}) }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  }
}

/** One plain sentence about daylight now — never a judgement about what that means for her. */
export function daylightSentence(o: DaylightOutlook, now: Date, timeZone?: string | null): string {
  const mins = o.changeAt ? Math.round((o.changeAt.getTime() - now.getTime()) / 60_000) : null;
  const when = (d: Date) => (mins !== null && mins <= 90 ? `in ${mins} min` : `at about ${clockIn(d, timeZone)}`);
  if (o.state === "daylight") return o.changeAt ? `Daylight until about ${clockIn(o.changeAt, timeZone)}` : "Daylight all day here";
  if (o.state === "dark") return o.changeAt ? `Dark now · first light ${when(o.changeAt)}` : "Dark all day here";
  // Twilight: say which way it is going.
  return o.changeTo === "dark" ? `Getting dark · dark ${o.changeAt ? when(o.changeAt) : "soon"}` : `First light now · daylight ${o.changeAt ? when(o.changeAt) : "soon"}`;
}
