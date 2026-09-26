import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { localeFor } from "@/server/locale";

export const dynamic = "force-dynamic";

/** Area name + the Location Context for where she is (emergency number, helplines). POST keeps coordinates out of URLs and logs. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:reverse:m", max: 480, windowMs: 60_000 }], now);
  const p = await readJson(req, point, 256);
  const r = await getGeo().reverse(p);
  return json({ label: r.label, precise: r.precise, locale: localeFor(r.country, r.region) });
});
