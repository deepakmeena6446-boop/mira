import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { cellsAlongRoute, notesForCells } from "@/server/notes";

export const dynamic = "force-dynamic";

/** Walking route + what's along it + released community notes on the way. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:route:m", max: 60, windowMs: 60_000 }], now);
  const { from, to } = await readJson(req, z.object({ from: point, to: point }).strict(), 512);
  const geo = getGeo();
  const route = await geo.walk(from, to);
  const mid = route.geometry[Math.floor(route.geometry.length / 2)] ?? [to.lon, to.lat];
  const [along, notes] = await Promise.all([
    geo.nearby({ lat: mid[1], lon: mid[0] }, Math.min(1500, Math.max(300, route.meters / 2))),
    notesForCells(sql, cellsAlongRoute(route.geometry)),
  ]);
  return json({ route, along: along.slice(0, 12), notes });
});
