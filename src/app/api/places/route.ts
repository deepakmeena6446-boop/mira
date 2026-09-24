import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { unavailable, badRequest } from "@/server/http/errors";
import { searchPlaces } from "@/server/know/places";
import { pilotStatus } from "@/server/pilot/status";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/** Public local place search over the pilot index. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > 80) throw badRequest("query_too_long", "Search text is too long.");
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "places", max: 240, windowMs: 60_000 }], now);
  if (!(await pilotStatus(sql)).available) throw unavailable("map_unavailable", "Pilot map data isn't loaded.");
  return json({ places: await searchPlaces(sql, q) });
});
