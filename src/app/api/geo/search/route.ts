import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";

export const dynamic = "force-dynamic";

const body = z.object({ q: z.string().max(80), near: point.nullable().optional() }).strict();

/** POST keeps the user's coordinates (and what they search for) out of URLs and logs. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:search:m", max: 960, windowMs: 60_000 }], now);
  const { q, near } = await readJson(req, body, 512);
  return json({ places: await getGeo().search(q, near ?? undefined) });
});
