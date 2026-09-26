import "server-only";
import type postgres from "postgres";
import { dailyKey } from "@/server/ratelimit";

/**
 * Global daily token guard for Mira on Claude: input + output tokens across everyone, per
 * UTC day, in `abuse_counters` (same table and daily-rotated HMAC keys as the rate limits).
 * Over the ceiling, Mira answers with the scripted engine for the rest of the day. Cache
 * reads count as a tenth of a token (their price); a typical message is ~2k counted tokens
 * (docs/MIRA_EVAL.md), so the default allows roughly a thousand messages a day. Message caps
 * in api/mira bound request volume; this bounds spend when replies or tool loops run long.
 */
export const MIRA_DAILY_TOKEN_DEFAULT = 2_000_000;
const BUCKET = "mira:tokens:d";
const DAY_MS = 86_400_000;

function key(now: Date) {
  return { keyHmac: dailyKey("global", "mira:tokens", now), windowStart: new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS) };
}

export async function tokensUsedToday(sql: postgres.Sql, now: Date): Promise<number> {
  const k = key(now);
  const [row] = await sql<{ count: number }[]>`SELECT count FROM abuse_counters WHERE key_hmac = ${k.keyHmac} AND bucket = ${BUCKET} AND window_start = ${k.windowStart}`;
  return row?.count ?? 0;
}

export async function recordTokens(sql: postgres.Sql, tokens: number, now: Date): Promise<void> {
  const n = Math.max(0, Math.min(Math.round(tokens), 1_000_000));
  if (!n) return;
  const k = key(now);
  await sql`
    INSERT INTO abuse_counters (key_hmac, bucket, window_start, count, expires_at)
    VALUES (${k.keyHmac}, ${BUCKET}, ${k.windowStart}, ${n}, ${new Date(k.windowStart.getTime() + 2 * DAY_MS)})
    ON CONFLICT (key_hmac, bucket, window_start) DO UPDATE SET count = LEAST(abuse_counters.count + ${n}, 2000000000)`;
}

export async function tokenBudgetSpent(sql: postgres.Sql, max: number, now: Date): Promise<boolean> {
  return (await tokensUsedToday(sql, now)) >= max;
}
