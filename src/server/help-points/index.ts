import "server-only";
import { dedupeHelpPoints, helpPointsAlongRoute, samplePointsForRoutes, type HelpPoint } from "@/domain/help-points";
import { haversineMeters } from "@/domain/pilot";
import type { GeoPoint, GeoProvider } from "@/server/providers/geo";

/**
 * Help Points for route sheets and "near me" (rules in src/domain/help-points.ts). The
 * provider finds candidates; which ones count and in what order is decided here and in
 * the domain module, deterministically. A failing lookup means fewer Help Points shown,
 * never an error on the route itself.
 */

/** Radius around each sample point: with ~900 m spacing it covers the 200 m corridor. */
const SAMPLE_RADIUS_M = 550;
const NEAR_RADIUS_M = 1500;
const NEAR_MAX = 10;

const quiet = async (p: Promise<HelpPoint[]>): Promise<HelpPoint[]> => {
  try {
    return await p;
  } catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "help_points.failed", error: err instanceof Error ? err.name : "unknown" }));
    return [];
  }
};

/**
 * Help Points along each route option, from one shared set of lookups (alternatives mostly
 * overlap). Straight-line estimates (≤ 2 points) get none: they don't follow any street.
 */
export async function helpPointsForRoutes(geo: GeoProvider, geometries: Array<Array<[number, number]>>): Promise<HelpPoint[][]> {
  const real = geometries.filter((g) => g.length > 2);
  if (!real.length) return geometries.map(() => []);
  const candidates = await quiet(geo.helpPlaces(samplePointsForRoutes(real), SAMPLE_RADIUS_M));
  return geometries.map((g) => (g.length > 2 ? helpPointsAlongRoute(candidates, g) : []));
}

/** Help Points around her, nearest first (ranked for "right now" on the device). */
export async function helpPointsNear(geo: GeoProvider, p: GeoPoint): Promise<HelpPoint[]> {
  const found = await quiet(geo.helpPlaces([p], NEAR_RADIUS_M));
  return dedupeHelpPoints(found)
    .map((h) => ({ h, d: haversineMeters(p, h) }))
    .filter(({ d }) => d <= NEAR_RADIUS_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, NEAR_MAX)
    .map(({ h }) => h);
}
