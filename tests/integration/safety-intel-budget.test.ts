import { describe, expect, it } from "vitest";
import { getSql } from "@/server/db/client";
import { tokensUsedToday } from "@/server/providers/companion/budget";
import { dailyTokensSpent, dailyTokensUsed, recordDailyTokens, SAFETY_CLASSIFIER_BUCKET } from "@/server/ratelimit/daily-tokens";

describe("Safety updates classifier budget", () => {
  it("has its own daily bucket: public safety-updates traffic never spends Mira's tokens", async () => {
    const sql = getSql();
    const now = new Date("2026-09-27T10:00:00Z");
    const miraBefore = await tokensUsedToday(sql, now);
    const before = await dailyTokensUsed(sql, SAFETY_CLASSIFIER_BUCKET, now);
    await recordDailyTokens(sql, SAFETY_CLASSIFIER_BUCKET, 1_200, now);
    await recordDailyTokens(sql, SAFETY_CLASSIFIER_BUCKET, 800, now);
    expect(await dailyTokensUsed(sql, SAFETY_CLASSIFIER_BUCKET, now)).toBe(before + 2_000);
    expect(await tokensUsedToday(sql, now)).toBe(miraBefore); // Mira's bucket is untouched
    expect(await dailyTokensSpent(sql, SAFETY_CLASSIFIER_BUCKET, before + 2_000, now)).toBe(true);
    expect(await dailyTokensSpent(sql, SAFETY_CLASSIFIER_BUCKET, before + 2_001, now)).toBe(false);
    // A new UTC day starts a new bucket.
    expect(await dailyTokensUsed(sql, SAFETY_CLASSIFIER_BUCKET, new Date("2026-09-28T00:00:01Z"))).toBe(0);
  });
});
