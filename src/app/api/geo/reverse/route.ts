import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";

export const dynamic = "force-dynamic";

/** POST keeps the user's coordinates out of URLs and logs. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:reverse:m", max: 480, windowMs: 60_000 }], now);
  const p = await readJson(req, point, 256);
  return json(await getGeo().reverse(p));
});
