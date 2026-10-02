import type { LatLon } from "./pilot";
import type { PlannedRoutes, RouteGraph } from "./routing";
import { pathCoords } from "./routing";
import type { PlanEvidence } from "./plan-contract";

export type OptionState = "ready" | "missing" | "empty" | "stale" | "failed";
export type PlanOption = { id: string; label: string; minutes: number; meters: number; geometry: [number, number][]; evidence: PlanEvidence[] };
export type PlanOptionsResult = { state: OptionState; checkedAt: string; source: string | null; sourceAt: string | null; scope: string; options: PlanOption[]; daylight: PlanEvidence; service: PlanEvidence; detail: string };

export const GRAPH_MAX_AGE_MS = 365 * 24 * 60 * 60_000;

/** A local wall time can be absent or repeated at a DST transition. Never guess which instant it means. */
export function instantForLocal(local: string, timeZone: string): Date | null {
  const target = local.replace("T", " ");
  const nominal = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(nominal)) return null;
  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  catch { return null; }
  const matches: Date[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = new Date(nominal - offset * 60_000);
    if (format.format(instant) === target) matches.push(instant);
  }
  return matches.length === 1 ? matches[0] : null;
}

/** NOAA's fractional-year solar-position approximation; horizon uncertainty is reported as unknown. */
export function daylightAt(instant: Date, point: LatLon): "daylight" | "dark" | "uncertain" {
  const year = instant.getUTCFullYear();
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29;
  const day = Math.floor((instant.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  const hour = instant.getUTCHours() + instant.getUTCMinutes() / 60;
  const gamma = 2 * Math.PI / (leap ? 366 : 365) * (day - 1 + (hour - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const ha = ((hour * 60 + eqtime + 4 * point.lon) / 4 - 180) * Math.PI / 180;
  const lat = point.lat * Math.PI / 180;
  const elevation = 90 - Math.acos(Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)))) * 180 / Math.PI;
  return elevation > 2 ? "daylight" : elevation < -8 ? "dark" : "uncertain";
}

export function resolvePlanOptions(input: { graph: RouteGraph | null; routes: PlannedRoutes | null; sourceAt: Date | null; checkedAt: Date; from: LatLon; to: LatLon; local: string; timeZone: string; failed?: boolean }): PlanOptionsResult {
  const { graph, routes, sourceAt, checkedAt, from, to, local, timeZone } = input;
  const scope = `${from.lat.toFixed(5)},${from.lon.toFixed(5)} → ${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  const routeScope = { kind: "route" as const, ref: scope, timeZone };
  const areaScope = { kind: "area" as const, ref: `${from.lat.toFixed(3)},${from.lon.toFixed(3)}`, timeZone };
  const unknown = (claim: string, reason: "not_checked" | "no_data" | "provider_failed" | "stale" | "conflicting" | "unsupported", retryable = false, area = false): PlanEvidence => ({ status: "unknown", claim, scope: area ? areaScope : routeScope, reason, retryable });
  const service = unknown("Ride and transit service at planned time", "unsupported");
  const instant = instantForLocal(local, timeZone);
  const daylight = instant && Math.abs(from.lat) <= 72
    ? (() => { const value = daylightAt(instant, from); return value === "uncertain" ? unknown("Daylight at planned departure", "conflicting", false, true) : { status: "known" as const, claim: "Daylight at planned departure", value, scope: areaScope, source: { id: "noaa-solar-equations", label: "NOAA solar-position calculation (approximate; weather and shade excluded)", observedAt: checkedAt.toISOString(), expiresAt: null } }; })()
    : unknown("Daylight at planned departure", "unsupported", false, true);
  const base = { state: "missing" as OptionState, checkedAt: checkedAt.toISOString(), source: sourceAt ? "OpenStreetMap imported walking graph" : null, sourceAt: sourceAt?.toISOString() ?? null, scope, options: [] as PlanOption[], daylight, service, detail: "Walking graph has not been imported for this area." };
  if (input.failed) return { ...base, state: "failed", detail: "The walking graph check failed. Retry later." };
  if (!graph || !sourceAt || !routes) return base;
  if (checkedAt.getTime() - sourceAt.getTime() > GRAPH_MAX_AGE_MS || sourceAt.getTime() > checkedAt.getTime()) return { ...base, state: "stale", detail: "The walking graph snapshot is too old to compare routes." };
  if (!routes.ok || !routes.routes.length) return { ...base, state: "empty", detail: routes.reason === "not_near_walkway" ? "One place is outside the imported walking network." : "No connected walking path was found in the imported graph." };
  const options = routes.routes.map((route, index) => ({
    id: `walk-${index}`, label: route.label === "Shortest" ? "Shortest mapped walk" : "Different mapped walk",
    minutes: route.minutes, meters: Math.round(route.lengthM),
    geometry: pathCoords(graph, route.path).map((point): [number, number] => [point.lon, point.lat]),
    evidence: [{ status: "known" as const, claim: "Mapped walking time estimate", value: route.minutes, scope: routeScope, source: { id: "osm-walking-graph", label: "© OpenStreetMap contributors (ODbL), imported walking graph; distance at 4.5 km/h", observedAt: sourceAt.toISOString(), expiresAt: new Date(sourceAt.getTime() + GRAPH_MAX_AGE_MS).toISOString() } }],
  }));
  return { ...base, state: "ready", options, detail: options.length > 1 ? "Compare distance and time; neither path is a safety recommendation." : "One mapped walking path is available; no distinct alternate met the route criteria." };
}
