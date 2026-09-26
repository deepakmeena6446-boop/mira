import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { cellsAlongRoute, notesForCells } from "@/server/notes";
import { lightingForRoutes } from "@/server/lighting";
import { helpPointsForRoutes } from "@/server/help-points";
import { haversineMeters } from "@/domain/pilot";
import { ApiError } from "@/server/http/errors";

const MAX_WALK_M = 25_000; // ~5 h on foot; trips are capped at 4 h anyway
/** An alternative much longer than the fastest way isn't a real option for a walk. */
const ALT_MAX_STRETCH = 1.5;

export const dynamic = "force-dynamic";

/**
 * Walking route + its context: lighting along it, Help Points along it, released community
 * notes on the way. `route`/`lighting`/`helpPoints` describe the fastest route; `alternatives`
 * (0–2) carry the same context for other options, computed from the same data so they can be
 * compared fairly. Every metric is deterministic; nothing here is a safety verdict.
 */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:route:m", max: 480, windowMs: 60_000 }], now);
  const { from, to } = await readJson(req, z.object({ from: point, to: point }).strict(), 512);
  // Walking routes only: refuse anything longer than a (long) walk before doing any work.
  if (haversineMeters(from, to) > MAX_WALK_M) throw new ApiError(400, "too_far", "That's too far to walk. Pick a closer place.");
  const geo = getGeo();
  const all = await geo.walkRoutes(from, to);
  const routes = all.filter((r, i) => i === 0 || (!r.approximate && r.minutes <= all[0].minutes * ALT_MAX_STRETCH)).slice(0, 3);
  // Only real street routes get lighting and Help Points: a straight-line estimate doesn't follow any street.
  const streets = routes.map((r) => (r.approximate ? [] : r.geometry));
  const [notes, lighting, helpPoints] = await Promise.all([notesForCells(sql, cellsAlongRoute(routes[0].geometry)), lightingForRoutes(sql, streets), helpPointsForRoutes(geo, streets)]);
  return json({
    route: routes[0],
    lighting: lighting[0],
    helpPoints: helpPoints[0],
    notes,
    alternatives: routes.slice(1).map((route, i) => ({ route, lighting: lighting[i + 1], helpPoints: helpPoints[i + 1] })),
  });
});
