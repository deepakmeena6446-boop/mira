import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { getGeo } from "@/server/providers/geo";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const near = Number.isFinite(lat) && Number.isFinite(lon) && url.searchParams.has("lat") ? { lat, lon } : undefined;
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:search:m", max: 120, windowMs: 60_000 }], now);
  return json({ places: await getGeo().search(q, near) });
});
