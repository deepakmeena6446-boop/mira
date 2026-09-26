import "server-only";
import { classWeight, dedupeHelpPoints, helpPointsAlongRoute, helpWeightsFor, rankHelpPoints, samplePointsForRoutes, type HelpPoint } from "@/domain/help-points";
import { haversineMeters } from "@/domain/pilot";
import type { GeoPoint, GeoProvider } from "@/server/providers/geo";
import type { HelpHours } from "@/server/providers/geo/types";

/**
 * Help Points for route sheets and "near me" (rules in src/domain/help-points.ts). The
 * provider finds candidates; which ones count and in what order is decided here and in
 * the domain module, deterministically. A failing lookup means fewer Help Points shown,
 * never an error on the route itself.
 *
 * Opening hours (owner decision, cost-controlled): discovery never asks Google for hours.
 * Only the shortlist actually shown — at most 5 places per request — gets its hours from
 * Google (Place Details, cached ≤ 6 h, GOOGLE_PLACES_HOURS=on). OpenStreetMap's listed
 * `opening_hours` stay the fallback. The device decides "open now" on its own clock.
 */

/** Radius around each sample point: with ~900 m spacing it covers the 200 m corridor. */
const SAMPLE_RADIUS_M = 550;
const NEAR_RADIUS_M = 1500;
const NEAR_MAX = 10;
/** No class fills more than this many of the "near me" places (so ten pharmacies can't hide the rest). */
const NEAR_PER_CLASS = 4;
/** Hours lookups per request (the places shown first). */
export const HOURS_SHORTLIST = 5;

const quiet = async <T>(p: Promise<T[]>): Promise<T[]> => {
  try {
    return await p;
  } catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "help_points.failed", error: err instanceof Error ? err.name : "unknown" }));
    return [];
  }
};

function withHours(p: HelpPoint, h: HelpHours): HelpPoint {
  const out: HelpPoint = { ...p, schedule: h.schedule, open24h: h.schedule === "24/7", hours: h.text, hoursSource: p.source };
  if (h.openNow !== undefined && h.checkedAt !== undefined) {
    out.openNow = h.openNow;
    out.checkedAt = h.checkedAt;
  }
  return out;
}

/**
 * Adds listed hours to the first `max` points (in the order given: pass them shortlist-first)
 * that have none yet, from the provider's per-place lookup. Points it can't enrich come back
 * unchanged ("hours not known"). Never throws.
 */
export async function enrichHours(geo: GeoProvider, points: HelpPoint[], max = HOURS_SHORTLIST): Promise<HelpPoint[]> {
  if (!geo.helpHours || !points.length) return points;
  const ids = [...new Set(points.filter((p) => !p.schedule && !p.open24h).map((p) => p.id))].slice(0, Math.min(max, HOURS_SHORTLIST));
  if (!ids.length) return points;
  let hours: Map<string, HelpHours>;
  try {
    hours = await geo.helpHours(ids);
  } catch {
    return points;
  }
  return points.map((p) => {
    const h = hours.get(p.id);
    return h && !p.schedule && !p.open24h ? withHours(p, h) : p;
  });
}

/**
 * Help Points along each route option, from one shared set of lookups (alternatives mostly
 * overlap). Straight-line estimates (≤ 2 points) get none: they don't follow any street.
 * Hours: the first few places in passing order, taken in turn from each option (≤ 5 in all).
 */
export async function helpPointsForRoutes(geo: GeoProvider, geometries: Array<Array<[number, number]>>, opts: { hours?: boolean } = {}): Promise<HelpPoint[][]> {
  const real = geometries.filter((g) => g.length > 2);
  if (!real.length) return geometries.map(() => []);
  const candidates = await quiet(geo.helpPlaces(samplePointsForRoutes(real), SAMPLE_RADIUS_M));
  const along = geometries.map((g) => (g.length > 2 ? helpPointsAlongRoute(candidates, g) : []));
  if (opts.hours === false) return along;
  const order: HelpPoint[] = [];
  for (let i = 0; order.length < HOURS_SHORTLIST * 3 && along.some((a) => a[i]); i++) for (const a of along) if (a[i]) order.push(a[i]);
  const enriched = new Map((await enrichHours(geo, order)).map((p) => [p.id, p]));
  return along.map((a) => a.map((p) => (enriched.has(p.id) ? { ...enriched.get(p.id)!, alongM: p.alongM } : p)));
}

/**
 * Help Points around her: candidates within reach, roughly ranked (walking time, class
 * weight — no hours or clock on the server), at most NEAR_PER_CLASS per class, and hours for
 * the first few. The device re-ranks them for right now, on its own clock.
 */
export async function helpPointsNear(geo: GeoProvider, p: GeoPoint, opts: { country?: string | null } = {}): Promise<HelpPoint[]> {
  const weights = helpWeightsFor(opts.country);
  const convenience = classWeight("convenience", weights) > 0;
  const found = dedupeHelpPoints(await quiet(geo.helpPlaces([p], NEAR_RADIUS_M, { convenience }))).filter((h) => haversineMeters(p, h) <= NEAR_RADIUS_M);
  const perClass = new Map<string, number>();
  const shortlist = rankHelpPoints(found, p, { situation: "nearby", night: false, weights })
    .filter((h) => {
      const n = perClass.get(h.cls) ?? 0;
      perClass.set(h.cls, n + 1);
      return n < NEAR_PER_CLASS;
    })
    .slice(0, NEAR_MAX);
  const keep = new Map(found.map((h) => [h.id, h]));
  return enrichHours(
    geo,
    shortlist.map((h) => keep.get(h.id)!),
  );
}
