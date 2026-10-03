import { z } from "zod";
import { immediateSupportIntent, shouldSeedPlan } from "@/domain/ask-routing";
import { assertSameOrigin } from "@/server/http/csrf";
import { handle, json, readJson } from "@/server/http/handler";
import { getSql } from "@/server/db/client";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { ephemeralIntentHints } from "@/server/providers/companion/intent";

export const dynamic = "force-dynamic";
const body = z.object({ message: z.string().trim().min(1).max(1000) }).strict();
/** Explicit submit only. No chat/plan rows, model history, personal context or text logs. */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const { message } = await readJson(request, body, 4096);
  const support = immediateSupportIntent(message);
  if (support) return json({ hints: null, source: "deterministic", modelAttempted: false, support });
  if (!shouldSeedPlan(message)) return json({ hints: null, source: "deterministic", modelAttempted: false, support: null });
  const sql = getSql(), now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(request), now)], [{ bucket: "mira:intent:m", max: 20, windowMs: 60_000 }, { bucket: "mira:intent:d", max: 100, windowMs: 86_400_000 }], now);
  const result = await ephemeralIntentHints(sql, message, now);
  return json({ ...result, support: null });
});
