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

export function dailyKey(kind: "ip" | "actor" | "global", value: string, now: Date): string {
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

/** Best-effort client IP from the proxy chain; only ever used inside an HMAC. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

export async function purgeExpiredCounters(sql: postgres.Sql, now: Date): Promise<number> {
  const rows = await sql`DELETE FROM abuse_counters WHERE expires_at <= ${now}`;
  return rows.count;
}
