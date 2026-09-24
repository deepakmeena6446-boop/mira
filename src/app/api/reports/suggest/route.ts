import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ApiError } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { getSuggestionProvider, minimiseForProvider } from "@/server/ai";

export const dynamic = "force-dynamic";

const body = z.object({ narrative: z.string().min(1).max(4000), consent: z.literal(true) }).strict();

/**
 * Consented, ephemeral AI suggestion for the review screen. Nothing is persisted; the
 * reporter decides whether to use it. Absent/failed provider → manual flow continues.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const provider = getSuggestionProvider();
  if (!provider) throw new ApiError(404, "not_available", "Suggestions aren't available.");
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "suggest:ip:h", max: 20, windowMs: 3600_000 }], now);
  const input = await readJson(req, body, 16_384);
  const result = await provider.suggest(minimiseForProvider(input.narrative));
  if (!result.ok) return json({ suggestion: null });
  return json({ suggestion: result.suggestion });
});
