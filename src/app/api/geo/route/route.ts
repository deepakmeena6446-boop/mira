import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo, type GeoPoint, type GeoProvider } from "@/server/providers/geo";
import { cellsAlongRoute, notesForCells } from "@/server/notes";
import { lightingForRoutes } from "@/server/lighting";
import { helpPointsForRoutes } from "@/server/help-points";
import { dedupeHelpPoints, type HelpPoint } from "@/domain/help-points";
import { TRAVEL_MODES } from "@/domain/travel-mode";
import { haversineMeters } from "@/domain/pilot";
import { ApiError } from "@/server/http/errors";

const MAX_WALK_M = 25_000; // ~5 h on foot; trips are capped at 4 h anyway
/** Ride / transit: a journey MIRA follows lasts at most ~4 h, so nothing further than a long drive. */
const MAX_RIDE_M = 400_000;
/** An alternative much longer than the fastest way isn't a real option for a walk. */
const ALT_MAX_STRETCH = 1.5;
/** Help Points "where you arrive": within a short walk of the destination. */
const ARRIVAL_RADIUS_M = 500;
const ARRIVAL_MAX = 5;

export const dynamic = "force-dynamic";

const body = z.object({ from: point, to: point, mode: z.enum(TRAVEL_MODES).default("walk") }).strict();

/** Help Points near the destination (the last walk of a ride or transit journey), nearest first. Failure = none. */
async function helpAtArrival(geo: GeoProvider, to: GeoPoint): Promise<HelpPoint[]> {
  try {
    return dedupeHelpPoints(await geo.helpPlaces([to], ARRIVAL_RADIUS_M))
      .map((h) => ({ h, d: haversineMeters(to, h) }))
      .filter(({ d }) => d <= ARRIVAL_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, ARRIVAL_MAX)
      .map(({ h }) => h);
  } catch {
    return [];
  }
}

/**
 * The way and its context, for how she is travelling (`mode`, default walk).
 *
 * Walk: walking route + lighting along it, Help Points along it, released community notes on
 * the way. `route`/`lighting`/`helpPoints` describe the fastest route; `alternatives` (0–2)
 * carry the same context for other options, computed from the same data so they can be
 * compared fairly.
 *
 * Ride / transit: `{ mode, route, arrivalHelp }`. `route` is the provider's one route (time,
 * distance, line for the map) or null when it has none — "not known", and the app asks her
 * when she expects to arrive. No lighting: street lighting is about walking. `arrivalHelp`:
 * Help Points within a short walk of where she arrives.
 *
 * Every metric is deterministic; nothing here is a safety verdict.
 */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:route:m", max: 480, windowMs: 60_000 }], now);
  const { from, to, mode } = await readJson(req, body, 512);
  const geo = getGeo();

  if (mode !== "walk") {
    if (haversineMeters(from, to) > MAX_RIDE_M) throw new ApiError(400, "too_far", "That's further than a journey MIRA can follow (up to 4 hours).");
    const [found, arrivalHelp] = await Promise.all([geo.routes(from, to, mode), helpAtArrival(geo, to)]);
    return json({ mode, route: found[0] ?? null, arrivalHelp });
  }

  // Walking routes only: refuse anything longer than a (long) walk before doing any work.
  if (haversineMeters(from, to) > MAX_WALK_M) throw new ApiError(400, "too_far", "That's too far to walk. Pick a closer place.");
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
