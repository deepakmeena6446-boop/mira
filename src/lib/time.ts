/** Display helpers: all pilot times are shown in Asia/Kolkata with an explicit IST label. */
const TZ = "Asia/Kolkata";

export function formatIstDate(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export function formatIstTime(iso: string | Date): string {
  return `${new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso))} IST`;
}

export function formatIstDateTime(iso: string | Date): string {
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso))} IST`;
}

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
