import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { getGeo } from "@/server/providers/geo";
import { areaFromReverse, safetyProviders, safetyUpdatesFor } from "@/server/safety-intel";
import { DEFAULT_WINDOW } from "@/domain/safety-updates";

export const dynamic = "force-dynamic";

const body = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    window: z.union([z.literal(7), z.literal(30)]).optional(),
  })
  .strict();

/**
 * Safety updates (Women Safety Intelligence) for the city around a point she chose to share:
 * where she is on Home, or a destination she picked. The point (POST body, never the URL)
 * is used once to name the city; only that name goes to news providers, and nothing about
 * her or the point is stored. Results are cached per city + window (src/server/safety-intel).
 */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "safety:updates:m", max: 60, windowMs: 60_000 }], now);
  const { window, ...p } = await readJson(req, body, 256);
  // Switched off: say so without spending a geocoding call.
  if (!safetyProviders().length) return json({ area: null, evidence: { state: "unavailable", sources: [{ source: "safety-updates", state: "unavailable" }], retryable: false } });
  const area = areaFromReverse(await getGeo().reverse(p));
  if (!area) {
    return json({ area: null, evidence: { state: "unavailable", sources: [{ source: "area", state: "unavailable" }], retryable: false } });
  }
  return json({ area, evidence: await safetyUpdatesFor(sql, area, window ?? DEFAULT_WINDOW) });
});
