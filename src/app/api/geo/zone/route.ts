import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { timeZoneFor } from "@/server/providers/geo/zone";

export const dynamic = "force-dynamic";

/** The time zone at a planned place, so its times are that place's (audit P05-001). POST keeps coordinates out of URLs. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:zone:m", max: 60, windowMs: 60_000 }], now);
  const p = await readJson(req, point.strict(), 256);
  return json(await timeZoneFor(p, now));
});
