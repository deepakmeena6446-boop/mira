/**
 * Display helpers. A journey's times are shown in the time zone of the traveller's phone (stored
 * on the journey as an IANA zone), labelled with that zone's abbreviation where one exists
 * ("9:05 pm EDT", "9:05 pm BST", "9:05 pm IST") or its offset ("9:05 pm GMT+10"). Nothing is
 * assumed: without a zone, times are shown in UTC and say so. Admin pages use UTC.
 */
export const DEFAULT_TIMEZONE = "UTC";

/** True for any IANA zone this runtime can format (including "UTC" and legacy aliases like "Asia/Calcutta"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length < 1 || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** The zone to format in: the given one when valid, otherwise UTC. */
export function zoneOrUtc(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

const OFFSET_ONLY = /^(GMT|UTC)[+-−]/;

/**
 * The zone's short name at that instant. Locales disagree on which zones get a letter
 * abbreviation (en-US knows EDT/PDT, en-GB knows BST/CET/GST, en-IN knows IST), so the first
 * real abbreviation wins; otherwise the offset ("GMT+10").
 */
export function zoneLabel(iso: string | Date, tz: string): string {
  const at = new Date(iso);
  let fallback = "";
  for (const locale of ["en-US", "en-GB", "en-IN"]) {
    const name = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name && !OFFSET_ONLY.test(name)) return name;
    fallback ||= name;
  }
  return fallback || tz;
}

function withZone(iso: string | Date, tz: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  const zone = zoneOrUtc(tz);
  // "9:05 PM", the same clock as every screen (en-GB writes "pm").
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...opts }).format(new Date(iso)).replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());
  return `${text} ${zoneLabel(iso, zone)}`;
}

export function formatPlaceDate(iso: string | Date, tz: string | null = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zoneOrUtc(tz), day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

/** "9:05 PM EDT" */
export function formatPlaceTime(iso: string | Date, tz: string | null = DEFAULT_TIMEZONE): string {
  return withZone(iso, tz, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "26 Sept, 9:05 pm EDT" */
export function formatPlaceDateTime(iso: string | Date, tz: string | null = DEFAULT_TIMEZONE): string {
  return withZone(iso, tz, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/** The local hour (0–23) at that instant in the zone. */
export function hourIn(iso: string | Date, tz: string | null | undefined): number {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zoneOrUtc(tz), hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
  return Number.isFinite(h) ? h % 24 : new Date(iso).getUTCHours();
}

/** The local calendar day ("2026-09-26") at that instant in the zone. */
export function dayIn(iso: string | Date, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zoneOrUtc(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** @deprecated Kept for admin pages (shown in UTC). Journey times use the formatPlace* helpers with the journey's zone. */
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
