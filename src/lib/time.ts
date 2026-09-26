/**
 * Display helpers. Times are shown in the time zone of the *place* (from its Location Context
 * profile), labelled with that zone's own abbreviation — never a hardcoded "IST". India is the
 * first profile, so it's the default where no place is known.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata"; // data/locales/IN.json "timezone"

function withZone(iso: string | Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: tz, timeZoneName: "short", ...opts }).formatToParts(new Date(iso));
  const zone = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const text = parts
    .filter((p) => p.type !== "timeZoneName")
    .map((p) => p.value)
    .join("")
    .replace(/[\s,]+$/, "");
  return zone ? `${text} ${zone}` : text;
}

export function formatPlaceDate(iso: string | Date, tz = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export function formatPlaceTime(iso: string | Date, tz = DEFAULT_TIMEZONE): string {
  return withZone(iso, tz, { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatPlaceDateTime(iso: string | Date, tz = DEFAULT_TIMEZONE): string {
  return withZone(iso, tz, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/** @deprecated Kept for the V0 flows; use the formatPlace* helpers with the place's time zone. */
export const formatIstDate = (iso: string | Date) => formatPlaceDate(iso);
/** @deprecated see formatIstDate */
export const formatIstTime = (iso: string | Date) => formatPlaceTime(iso);
/** @deprecated see formatIstDate */
export const formatIstDateTime = (iso: string | Date) => formatPlaceDateTime(iso);

/** Coarse relative age for source freshness, e.g. "3 days ago". */
export function relativeAge(iso: string | Date, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
