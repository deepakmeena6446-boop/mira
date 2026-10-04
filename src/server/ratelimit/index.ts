import type postgres from "postgres";
import { hmacHex } from "@/server/crypto";
import { tooMany } from "@/server/http/errors";

/**
 * Fixed-window counters in `abuse_counters`, keyed by a *daily-rotated* HMAC of
 * the IP or actor so raw identifiers never reach the database (architecture §3).
 * Rows expire after 24h. Limits are operational values and are not shown in UI.
 */
export interface Limit {
  bucket: string;
  max: number;
  windowMs: number;
}

export function dailyKey(kind: "ip" | "actor" | "global" | "recipient" | "guest", value: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return hmacHex(`abuse:${day}`, `${kind}:${value}`);
}

/** Increment and return whether the request is within the limit. */
export async function consume(sql: postgres.Sql, keyHmac: string, limit: Limit, now: Date): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / limit.windowMs) * limit.windowMs);
  const expires = new Date(Math.max(windowStart.getTime() + limit.windowMs, now.getTime() + 24 * 3600_000));
  const [row] = await sql<{ count: number }[]>`
    INSERT INTO abuse_counters (key_hmac, bucket, window_start, count, expires_at)
    VALUES (${keyHmac}, ${limit.bucket}, ${windowStart}, 1, ${expires})
    ON CONFLICT (key_hmac, bucket, window_start) DO UPDATE SET count = abuse_counters.count + 1
    RETURNING count`;
  return row.count <= limit.max;
}

export async function enforce(sql: postgres.Sql, keys: string[], limits: Limit[], now: Date): Promise<void> {
  for (const key of keys) {
    for (const limit of limits) {
      if (!(await consume(sql, key, limit, now))) throw tooMany();
    }
  }
}

/**
 * Client IP for rate limiting only (always HMAC'd, never stored raw). Clients can
 * forge the left of X-Forwarded-For, so we take the address appended by our own
 * proxy chain: the entry TRUSTED_PROXY_HOPS positions from the right (default 1).
 * Production must sit behind a proxy that appends the real client address.
 *
 * CLIENT_IP_HEADER (e.g. "x-real-ip" on Railway, whose edge overwrites it with the
 * connecting address) takes precedence when the platform documents a single trusted header.
 */
export function clientIp(req: Request): string {
  const trustedHeader = process.env.CLIENT_IP_HEADER?.trim();
  if (trustedHeader) {
    const v = req.headers.get(trustedHeader)?.split(",")[0]?.trim();
    if (v) return ipBucket(v.slice(0, 64));
  }
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? "1") || 1);
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    const pick = parts[Math.max(0, parts.length - hops)];
    if (pick) return ipBucket(pick.slice(0, 64));
  }
  return ipBucket(req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown");
}

/**
 * IPv6 clients usually hold a whole /64, so one person could otherwise rotate through
 * unlimited addresses (and unlimited rate-limit buckets). Count a /64 as one address.
 */
export function ipBucket(ip: string): string {
  if (!ip.includes(":") || /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) return ip;
  const [head] = ip.split("::");
  const groups = ip.includes("::") ? head.split(":").filter(Boolean) : ip.split(":");
  const full = ip.includes("::") ? [...groups, "0", "0", "0", "0"].slice(0, 4) : groups.slice(0, 4);
  return `${full.map((g) => g.toLowerCase()).join(":")}::/64`;
}

export async function purgeExpiredCounters(sql: postgres.Sql, now: Date): Promise<number> {
  const rows = await sql`DELETE FROM abuse_counters WHERE expires_at <= ${now}`;
  return rows.count;
}
