import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { helpPointsNear } from "@/server/help-points";

export const dynamic = "force-dynamic";

/**
 * Help Points around a point (coordinates in the POST body, never the URL). Fetched ahead of
 * time by Home and Trip so the "I feel unsafe" sheet can show the nearest one instantly;
 * the device ranks them for right now (src/domain/help-points.ts).
 */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:help:m", max: 240, windowMs: 60_000 }], now);
  const p = await readJson(req, point, 256);
  return json({ helpPoints: await helpPointsNear(getGeo(), p) });
});
