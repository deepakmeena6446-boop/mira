import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { countryContext } from "@/server/locale";

export const dynamic = "force-dynamic";
const body = point.extend({ source: z.literal("osm").optional() }).strict();

/** Area name + the Country Context for where she is (emergency numbers, helplines, time zone). POST keeps coordinates out of URLs and logs. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:reverse:m", max: 480, windowMs: 60_000 }], now);
  const { source, ...p } = await readJson(req, body, 256);
  const r = await getGeo(source).reverse(p);
  return json({ label: r.label, precise: r.precise, country: countryContext(r.country, r.region) });
});
