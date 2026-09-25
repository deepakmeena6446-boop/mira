import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { notesNear } from "@/server/notes";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:nearby:m", max: 60, windowMs: 60_000 }], now);
  const p = await readJson(req, point, 256);
  const [places, notes] = await Promise.all([getGeo().nearby(p, 800), notesNear(sql, p)]);
  return json({ places, notes });
});
