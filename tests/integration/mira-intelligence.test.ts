import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { dailyKey } from "@/server/ratelimit";
import { recordTokens, tokensUsedToday } from "@/server/providers/companion/budget";
import { RESTING_NOTE } from "@/server/providers/companion";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as placesPOST } from "@/app/api/me/places/route";
import { POST as miraPOST, GET as miraGET, MIRA_DAILY_MAX } from "@/app/api/mira/route";
import { miraTools } from "@/server/providers/companion/tools";
import { requireUser } from "@/server/session/user";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const HOME = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };
const ctx = (extra: Record<string, unknown> = {}) => ({ localTime: new Date().toISOString(), tzOffsetMin: -330, location: START, ...extra });
const DAY_MS = 86_400_000;

async function signIn(name: string) {
  switchJar(newJar());
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
}
const streamed = async (message: string, context = ctx()) => {
  const res = await miraPOST(jsonRequest("/api/mira", { message, context }));
  expect(res.status).toBe(200);
  return (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; delta?: string; card?: { type: string } });
};

describe("Mira: global context, budget and caps", () => {
  beforeAll(async () => {
    applyTestEnv();
    resetEnvCache();
    await loadFixturePilot(getSql());
  });
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
  });

  it("accepts the device's IANA time zone and refuses a malformed one", async () => {
    await signIn("Zara");
    const ok = await streamed("what time is it?", ctx({ tz: "Asia/Kolkata" }));
    expect(ok.filter((e) => e.type === "text").map((e) => e.delta).join("")).toMatch(/\d{1,2}:\d{2} (am|pm)/);
    expect((await miraPOST(jsonRequest("/api/mira", { message: "hi", context: ctx({ tz: "../../etc/passwd" }) }))).status).toBe(400);
    expect((await miraPOST(jsonRequest("/api/mira", { message: "hi", context: ctx({ tz: null }) }))).status).toBe(200);
  });

  it("Help Point and place lists are shown live but never saved to history", async () => {
    await signIn("Yara");
    const live = await streamed("Find somewhere staffed nearby");
    expect(live.some((e) => e.type === "card" && e.card?.type === "help_points")).toBe(true); // the pilot fixture has Help Points
    await streamed("I feel uneasy");
    const { messages } = await (await miraGET()).json();
    const cards = messages.flatMap((m: { cards: Array<{ type: string }> }) => m.cards);
    expect(cards.some((c: { type: string }) => c.type === "help_points" || c.type === "places")).toBe(false);
    expect(JSON.stringify(messages)).not.toMatch(/28\.69|77\.21/);
  });

  it("when the day's token budget is spent, Mira rests and the scripted Mira still answers", async () => {
    applyTestEnv({ ANTHROPIC_API_KEY: "sk-ant-test-not-a-real-key", MIRA_DAILY_TOKEN_MAX: "500" });
    resetEnvCache();
    const sql = getSql();
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
    try {
      await signIn("Wanjiru");
      await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }));
      await recordTokens(sql, 300, now);
      await recordTokens(sql, 300, now);
      expect(await tokensUsedToday(sql, now)).toBeGreaterThanOrEqual(600);
      const events = await streamed("take me home");
      expect(events[0]).toEqual({ type: "text", delta: RESTING_NOTE });
      expect(events.some((e) => e.type === "card" && e.card?.type === "trip")).toBe(true);
      expect(events.at(-1)).toEqual({ type: "done" });
      expect(events.some((e) => e.type === "usage" || e.type === "history")).toBe(false); // server-only events never leave
    } finally {
      await sql`DELETE FROM abuse_counters WHERE key_hmac = ${dailyKey("global", "mira:tokens", now)} AND bucket = 'mira:tokens:d' AND window_start = ${windowStart}`;
      applyTestEnv();
      resetEnvCache();
    }
  });

  it("past her daily cap, a danger message still gets the scripted reply and the Emergency card; the burst limit still rejects", async () => {
    applyTestEnv({ ANTHROPIC_API_KEY: "sk-ant-test-not-a-real-key" });
    resetEnvCache();
    const sql = getSql();
    const now = new Date();
    try {
      await signIn("Ubah");
      const user = await requireUser(sql);
      const actor = dailyKey("actor", user.id, now);
      await sql`INSERT INTO abuse_counters (key_hmac, bucket, window_start, count, expires_at)
                VALUES (${actor}, 'mira:d', ${new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS)}, ${MIRA_DAILY_MAX}, ${new Date(now.getTime() + DAY_MS)})`;
      const events = await streamed("someone is following me");
      expect(events[0]).toEqual({ type: "text", delta: RESTING_NOTE }); // no model call past the cap
      expect(events.some((e) => e.type === "card" && e.card?.type === "sos")).toBe(true);
      expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toMatch(/If you're in danger right now/);

      const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
      await sql`INSERT INTO abuse_counters (key_hmac, bucket, window_start, count, expires_at)
                VALUES (${actor}, 'mira:m', ${minute}, 20, ${new Date(now.getTime() + DAY_MS)})
                ON CONFLICT (key_hmac, bucket, window_start) DO UPDATE SET count = 20`;
      expect((await miraPOST(jsonRequest("/api/mira", { message: "hi", context: ctx() }))).status).toBe(429);
    } finally {
      applyTestEnv();
      resetEnvCache();
    }
  });

  it("get_safety_updates reuses the Safety updates pipeline: checked for her city, 'no place' without a trip, off when switched off", async () => {
    const sql = getSql();
    await signIn("Tanvi");
    const user = await requireUser(sql);
    try {
      process.env.SAFETY_UPDATES = "fixture";
      resetEnvCache();
      const tools = miraTools(sql, user, ctx());
      const here = await tools.safetyUpdates("here");
      expect(here).toMatchObject({ status: "checked", area: "Delhi", precision: "city" });
      if (here.status !== "checked") throw new Error("unreachable");
      expect(here.count).toBeGreaterThan(0);
      expect(here.latest[0]).toEqual(expect.objectContaining({ publisher: expect.any(String), age_days: expect.any(Number) }));
      expect(JSON.stringify(here)).not.toMatch(/\[Sample\]|https?:/); // no headlines or links reach the model
      expect(tools.coverage()).toMatch(/Safety updates: recent news reports/);
      expect(await tools.safetyUpdates("destination")).toEqual({ status: "no_place", reason: expect.stringMatching(/No journey is running/) });
      const text = (await streamed("any recent safety updates here?")).filter((e) => e.type === "text").map((e) => e.delta).join("");
      expect(text).toMatch(/Safety updates section on Home/);
    } finally {
      process.env.SAFETY_UPDATES = "off";
      resetEnvCache();
    }
    expect(await miraTools(sql, user, ctx()).safetyUpdates("here")).toEqual({ status: "off" });
  });

  it("the global model cap falls back to scripted Mira", async () => {
    await signIn("Vera");
    const sql = getSql();
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
    const key = dailyKey("global", "mira", now);
    const [before] = await sql<{ count: number }[]>`SELECT count FROM abuse_counters WHERE key_hmac = ${key} AND bucket = 'mira:global:d' AND window_start = ${windowStart}`;
    try {
      await sql`INSERT INTO abuse_counters (key_hmac, bucket, window_start, count, expires_at)
                VALUES (${key}, 'mira:global:d', ${windowStart}, 5000, ${new Date(now.getTime() + DAY_MS)})
                ON CONFLICT (key_hmac, bucket, window_start) DO UPDATE SET count = 5000`;
      const res = await miraPOST(jsonRequest("/api/mira", { message: "hi", context: ctx() }));
      expect(res.status).toBe(200);
      expect((await res.text()).includes(RESTING_NOTE)).toBe(true);
    } finally {
      await sql`UPDATE abuse_counters SET count = ${before?.count ?? 0} WHERE key_hmac = ${key} AND bucket = 'mira:global:d' AND window_start = ${windowStart}`;
    }
  });
});
