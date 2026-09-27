import "server-only";
import type postgres from "postgres";
import { dailyKey } from "@/server/ratelimit";

/**
 * A named global daily token bucket (input + output tokens across everyone, per UTC day) in
 * `abuse_counters`, with the same daily-rotated HMAC keys as the rate limits. Each model feature
 * gets its own bucket, so one public feature can't spend another's budget.
 *
 * Used by the Safety updates relevance classifier (bucket "safety:classifier"), which is reached
 * from the public /api/safety-updates: its traffic across many cities must never drain Mira's
 * budget (src/server/providers/companion/budget.ts). Over its ceiling, ambiguous headlines go
 * unassessed and the result says so ("partial"), never "no updates".
 */
export const SAFETY_CLASSIFIER_BUCKET = "safety:classifier";
export const SAFETY_CLASSIFIER_DAILY_TOKEN_DEFAULT = 300_000;
const DAY_MS = 86_400_000;

function key(bucket: string, now: Date) {
  return { keyHmac: dailyKey("global", `${bucket}:tokens`, now), bucket: `${bucket}:tokens:d`, windowStart: new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS) };
}

export async function dailyTokensUsed(sql: postgres.Sql, bucket: string, now: Date): Promise<number> {
  const k = key(bucket, now);
  const [row] = await sql<{ count: number }[]>`SELECT count FROM abuse_counters WHERE key_hmac = ${k.keyHmac} AND bucket = ${k.bucket} AND window_start = ${k.windowStart}`;
  return row?.count ?? 0;
}

export async function recordDailyTokens(sql: postgres.Sql, bucket: string, tokens: number, now: Date): Promise<void> {
  const n = Math.max(0, Math.min(Math.round(tokens), 1_000_000));
  if (!n) return;
  const k = key(bucket, now);
  await sql`
    INSERT INTO abuse_counters (key_hmac, bucket, window_start, count, expires_at)
    VALUES (${k.keyHmac}, ${k.bucket}, ${k.windowStart}, ${n}, ${new Date(k.windowStart.getTime() + 2 * DAY_MS)})
    ON CONFLICT (key_hmac, bucket, window_start) DO UPDATE SET count = LEAST(abuse_counters.count + ${n}, 2000000000)`;
}

export async function dailyTokensSpent(sql: postgres.Sql, bucket: string, max: number, now: Date): Promise<boolean> {
  return (await dailyTokensUsed(sql, bucket, now)) >= max;
}
