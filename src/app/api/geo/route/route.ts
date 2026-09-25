import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { cellsAlongRoute, notesForCells } from "@/server/notes";
import { lightingForRoute } from "@/server/lighting";
import { haversineMeters } from "@/domain/pilot";
import { ApiError } from "@/server/http/errors";

const MAX_WALK_M = 25_000; // ~5 h on foot; trips are capped at 4 h anyway

export const dynamic = "force-dynamic";

/** Walking route + what's along it + released community notes on the way. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:route:m", max: 480, windowMs: 60_000 }], now);
  const { from, to } = await readJson(req, z.object({ from: point, to: point }).strict(), 512);
  // Walking routes only: refuse anything longer than a (long) walk before doing any work.
  if (haversineMeters(from, to) > MAX_WALK_M) throw new ApiError(400, "too_far", "That's too far to walk. Pick a closer place.");
  const geo = getGeo();
  const route = await geo.walk(from, to);
  const mid = route.geometry[Math.floor(route.geometry.length / 2)] ?? [to.lon, to.lat];
  const [along, notes, lighting] = await Promise.all([
    geo.nearby({ lat: mid[1], lon: mid[0] }, Math.min(1500, Math.max(300, route.meters / 2))),
    notesForCells(sql, cellsAlongRoute(route.geometry)),
    // Only real street routes: a straight-line estimate doesn't follow any street.
    route.approximate ? Promise.resolve(null) : lightingForRoute(sql, route.geometry),
  ]);
  return json({ route, along: along.slice(0, 12), notes, lighting });
});
