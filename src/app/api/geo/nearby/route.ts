import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { notesNear } from "@/server/notes";

export const dynamic = "force-dynamic";
const body = point.extend({ source: z.literal("osm").optional() }).strict();

export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:nearby:m", max: 480, windowMs: 60_000 }], now);
  const { source, ...p } = await readJson(req, body, 256);
  const [places, notes] = await Promise.all([getGeo(source).nearby(p, 800), notesNear(sql, p)]);
  return json({ places, notes });
});
