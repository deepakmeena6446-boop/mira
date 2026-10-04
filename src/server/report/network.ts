import "server-only";
import { hmacHex } from "@/server/crypto";

/** Monday-start ISO week, "2026-W40": the salt, so a network hash can't link one person's reports across weeks. */
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Which network a report came from, coarsely and privately (audit P14-001): a keyed hash of the IPv4 /24 or IPv6 /48,
 * salted by week. Never the address. Many people share a mobile carrier's address, so this only ever adds a
 * "several networks" requirement — it never merges different people into one.
 */
export function reportNetworkHash(ip: string, now: Date): string | null {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip.trim());
  let prefix: string | null = null;
  if (v4) prefix = `${v4[1]}.${v4[2]}.${v4[3]}`;
  else if (ip.includes(":")) prefix = ip.toLowerCase().split(":").slice(0, 3).join(":");
  return prefix ? hmacHex("report-network", `${isoWeek(now)}|${prefix}`) : null;
}
