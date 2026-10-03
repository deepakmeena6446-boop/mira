import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo, type GeoPoint, type GeoProvider } from "@/server/providers/geo";
import { cellsAlongRoute, notesForCells } from "@/server/notes";
import { lightingEvidenceForRoutes } from "@/server/lighting";
import { helpPointsEvidenceForRoutes, withoutCorroboratedGone } from "@/server/help-points";
import { dedupeHelpPoints, type HelpPoint } from "@/domain/help-points";
import { evidenceState, type EvidenceState } from "@/domain/evidence-state";
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

const body = z.object({ from: point, to: point, mode: z.enum(TRAVEL_MODES).default("walk"), source: z.literal("osm").optional() }).strict();

/** Help Points near the destination (the last walk of a ride or transit journey), nearest first, with whether the lookup worked. */
async function helpAtArrival(geo: GeoProvider, to: GeoPoint): Promise<{ points: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }> {
  const failed = { state: "failed" as const, sources: [{ source: "map provider", state: "failed" as const, retryable: true }], retryable: true };
  const source: EvidenceState<HelpPoint[]> = geo.helpPlacesEvidence
    ? await geo.helpPlacesEvidence([to], ARRIVAL_RADIUS_M).catch(() => failed)
    : await geo.helpPlaces([to], ARRIVAL_RADIUS_M).then((data) => evidenceState(data, data.length > 0, [{ source: "map provider", state: "ready" as const }])).catch(() => failed);
  if (!("data" in source)) return { points: [], evidence: source }; // failed ≠ none near where she arrives
  const points = dedupeHelpPoints(source.data)
    .map((h) => ({ h, d: haversineMeters(to, h) }))
    .filter(({ d }) => d <= ARRIVAL_RADIUS_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, ARRIVAL_MAX)
    .map(({ h }) => h);
  return { points, evidence: evidenceState(points, points.length > 0, source.sources) };
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
 * Help Points within a short walk of where she arrives; `arrivalEvidence` says whether that lookup worked.
 *
 * Every metric is deterministic; nothing here is a safety verdict.
 */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:route:m", max: 480, windowMs: 60_000 }], now);
  const { from, to, mode, source } = await readJson(req, body, 512);
  const geo = getGeo(source);

  if (mode !== "walk") {
    if (haversineMeters(from, to) > MAX_RIDE_M) throw new ApiError(400, "too_far", "That's further than a journey MIRA can follow (up to 4 hours).");
    const [found, arrival] = await Promise.all([geo.routes(from, to, mode), helpAtArrival(geo, to)]);
    return json({ mode, route: found[0] ?? null, arrivalHelp: arrival.points, arrivalEvidence: arrival.evidence });
  }

  // Walking routes only: refuse anything longer than a (long) walk before doing any work.
  if (haversineMeters(from, to) > MAX_WALK_M) throw new ApiError(400, "too_far", "That's too far to walk. Pick a closer place.");
  const all = await geo.walkRoutes(from, to);
  const routes = all.filter((r, i) => i === 0 || (!r.approximate && r.minutes <= all[0].minutes * ALT_MAX_STRETCH)).slice(0, 3);
  // Only real street routes get lighting and Help Points: a straight-line estimate doesn't follow any street.
  const streets = routes.map((r) => (r.approximate ? [] : r.geometry));
  const [notes, lighting, helpPoints] = await Promise.all([notesForCells(sql, cellsAlongRoute(routes[0].geometry)), lightingEvidenceForRoutes(sql, streets), helpPointsEvidenceForRoutes(geo, streets)]);
  const filteredHelp = await Promise.all(helpPoints.map(async (e) => {
    if (!("data" in e)) return e;
    const data = await withoutCorroboratedGone(sql, e.data);
    return { ...e, data, state: e.state === "ready" && !data.length ? "empty" as const : e.state };
  }));
  return json({
    route: routes[0],
    lighting: "data" in lighting[0] ? lighting[0].data : null,
    lightingEvidence: lighting[0],
    helpPoints: "data" in filteredHelp[0] ? filteredHelp[0].data : [],
    helpEvidence: filteredHelp[0],
    notes,
    alternatives: routes.slice(1).map((route, i) => { const evidence = lighting[i + 1]; const help = filteredHelp[i + 1]; return { route, lighting: "data" in evidence ? evidence.data : null, lightingEvidence: evidence, helpPoints: "data" in help ? help.data : [], helpEvidence: help }; }),
  });
});
