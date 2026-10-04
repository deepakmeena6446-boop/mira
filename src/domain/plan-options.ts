import type { LatLon } from "./pilot";
import type { PlannedRoutes, RouteGraph } from "./routing";
import { pathCoords, routeSteps } from "./routing";
import type { MovementIntent, PlanEvidence } from "./plan-contract";
import { resolvedDestination, resolvedOrigin } from "./plan-state";

export type OptionState = "ready" | "missing" | "empty" | "stale" | "failed";
export type PlanOption = { id: string; label: string; minutes: number; meters: number; geometry: [number, number][]; evidence: PlanEvidence[]; kind?: "walk" | "run" | "loop" | "out_and_back"; departureLocal?: string; arrivalLocal?: string; timeZone?: string; steps?: { name: string | null; highway: string; lengthM: number }[]; originAccessMeters?: number; daylight?: PlanEvidence };
export type PlanOptionsResult = { state: OptionState; checkedAt: string; source: string | null; sourceAt: string | null; scope: string; options: PlanOption[]; daylight: PlanEvidence; service: PlanEvidence; detail: string;
  constraints?: PlanRequirement[];
  timeAlternatives?: { local: string; timeZone: string; minutesLater: number; daylight: "daylight"; note?: string }[];
  manualPlan?: { mode: "ride" | "transit"; serviceEligible: false; nextSteps: string[] };
  targetMeters?: number;
};

/** A requirement she typed, and what MIRA can say about it: lighting from mapped data, the rest plainly not checked. */
export type PlanRequirement = { text: string; status: "checked" | "not_checked"; reason: string };

/** "well-lit", "lit streets", "street lights", "roshni": answered from the lighting mapped along each way. */
export const LIGHTING_REQUIREMENT = /(?<![\p{L}\p{N}])(?:well[- ]?lit|lit|lighting|lights?|street ?lights?|street ?lamps?|lamps?|bright|roshni|roshani|ujala|ujaala)(?![\p{L}\p{N}])|रोशनी|उजाला/iu;

/** What MIRA can't check yet, named plainly; anything else is "this". Step-free first: "step-free" isn't about cost. */
const UNSUPPORTED: Array<[RegExp, string]> = [
  [/step[- ]?free|wheel ?chair|accessib|stairs|steps|ramps?|lifts?|elevators?|prams?|strollers?|buggy/i, "step-free access"],
  [/cheap|low[- ]cost|cost|budget|price|fare|free/i, "cost"],
  [/busy|crowd|people around|populated|quiet|lonely|deserted|isolated/i, "how busy it is"],
  [/cctv|cameras?/i, "CCTV"],
  [/toilets?|restrooms?|washrooms?|bathrooms?/i, "toilets along the way"],
  [/police|guards?|security/i, "police or security presence"],
];

/**
 * One short line per requirement. `lighting`, per option in order: the share mapped as lit or with
 * street lamps (null when nothing is mapped along it), or "failed" when the lighting check failed;
 * absent when no lighting was looked up.
 */
export function planRequirements(texts: string[], options: Pick<PlanOption, "label">[], lighting?: Array<number | null> | "failed"): PlanRequirement[] {
  return texts.map((text) => {
    if (LIGHTING_REQUIREMENT.test(text)) {
      if (!options.length) return { text, status: "not_checked", reason: "There's no mapped way yet to check lighting along." };
      if (lighting === "failed") return { text, status: "not_checked", reason: "Mira couldn't check lighting along these ways just now." };
      if (!lighting) return { text, status: "not_checked", reason: "Mira hasn't checked lighting along these ways." };
      const parts = options.map((o, i) => `${o.label}: ${lighting[i] == null ? "lighting not known" : `${lighting[i]}% mapped as lit or with street lamps`}`);
      return lighting.some((l) => l != null)
        ? { text, status: "checked", reason: `${parts.join("; ")}. Mapped lighting, not whether the lamps work tonight.` }
        : { text, status: "checked", reason: "Lighting isn't mapped along these ways, so Mira can't say how lit they are." };
    }
    const what = UNSUPPORTED.find(([re]) => re.test(text))?.[1];
    return { text, status: "not_checked", reason: what ? `Mira can't check ${what} yet.` : "Mira can't check this yet." };
  });
}

/** Shared comparison identity includes every assumption that can change a choice. */
export function planOptionsKey(intent: MovementIntent): string {
  const from = resolvedOrigin(intent); const to = intent.loop ? from : resolvedDestination(intent);
  return from && to ? JSON.stringify({ from, to: { lat: to.lat, lon: to.lon }, departure: intent.departure, mode: intent.mode, activity: intent.activity, timeKind: intent.timeKind ?? "depart_at", loop: intent.loop, loopTarget: intent.loopTarget ?? null, paceMinutesPerKm: intent.paceMinutesPerKm ?? null, constraints: intent.constraints }) : "";
}

/** A selection belongs to this exact plan, without copying provider content into the choice. */
export function planSelectionContext(intent: MovementIntent): string {
  let hash = 2166136261;
  for (const char of planOptionsKey(intent)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function pedestrianPace(intent?: MovementIntent): number {
  return intent?.paceMinutesPerKm ?? (intent?.mode === "walk" && /\b(run|running|jog|jogging)\b/i.test(intent.activity) ? 6 : 60 / 4.5);
}

export function loopTargetMeters(intent: MovementIntent): number {
  const target = intent.loopTarget ?? { kind: "duration", value: 30 };
  return target.kind === "distance" ? target.value : target.value / pedestrianPace(intent) * 1_000;
}

export function localTimeForInstant(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant).replace(" ", "T");
}

export const GRAPH_MAX_AGE_MS = 365 * 24 * 60 * 60_000;

/** A local wall time can be absent or repeated at a DST transition. Never guess which instant it means. */
/**
 * The instant for a local wall time in a zone. Where clocks go back, a wall time happens twice: if one of them is within
 * three hours of `near` (her real "now" — a plan for now or soon) that's the one she means (audit P05-003: "Now" in the
 * repeated hour couldn't be planned). Further out, or where clocks go forward and the time doesn't exist, Mira won't
 * guess: null, and `clockChangeAt` says why.
 */
export function instantForLocal(local: string, timeZone: string, near: Date = new Date()): Date | null {
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
  if (matches.length === 1) return matches[0];
  const close = matches.filter((m) => Math.abs(m.getTime() - near.getTime()) <= 3 * 3600_000);
  if (close.length) return close.reduce((a, b) => (Math.abs(a.getTime() - near.getTime()) <= Math.abs(b.getTime() - near.getTime()) ? a : b));
  return null;
}

/** Why a wall time has no single instant: "repeated" (clocks go back: it happens twice) or "skipped" (clocks go forward). */
export function clockChangeAt(local: string, timeZone: string): "repeated" | "skipped" | null {
  // Only a full "YYYY-MM-DDTHH:MM": an empty or partial time used to parse as 2000-01-01 and read as "skipped" (re-audit RA4).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const nominal = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(nominal)) return null;
  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  catch { return null; }
  let n = 0;
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) if (format.format(new Date(nominal - offset * 60_000)) === local.replace("T", " ")) n++;
  return n === 0 ? "skipped" : n > 1 ? "repeated" : null;
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

/** First later calculated daylight within four hours; never a route or lighting claim. */
export function laterDaylight(local: string, timeZone: string, point: LatLon): { local: string; minutesLater: number } | null {
  const departure = instantForLocal(local, timeZone);
  if (!departure || Math.abs(point.lat) > 72) return null;
  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  catch { return null; }
  for (let minutesLater = 15; minutesLater <= 240; minutesLater += 15) {
    const candidate = new Date(departure.getTime() + minutesLater * 60_000);
    if (daylightAt(candidate, point) === "daylight") return { local: format.format(candidate).replace(" ", "T"), minutesLater };
  }
  return null;
}

/**
 * `lighting`: for a lighting requirement, the lit share per route (see planRequirements), looked up by the
 * caller for the same routes in the same order.
 */
export function resolvePlanOptions(input: { graph: RouteGraph | null; routes: PlannedRoutes | null; sourceAt: Date | null; checkedAt: Date; from: LatLon; to: LatLon; local: string; timeZone: string; failed?: boolean; intent?: MovementIntent; lighting?: Array<number | null> | "failed" }): PlanOptionsResult {
  const { graph, routes, sourceAt, checkedAt, from, to, local, timeZone, intent } = input;
  // Coordinates stay in the evidence ref (internal); the result's `scope` is shown and spoken, so it's words (audit L02-002).
  const scope = `${from.lat.toFixed(5)},${from.lon.toFixed(5)} → ${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  const routeScope = { kind: "route" as const, ref: scope, timeZone };
  const areaScope = { kind: "area" as const, ref: `${from.lat.toFixed(3)},${from.lon.toFixed(3)}`, timeZone };
  const unknown = (claim: string, reason: "not_checked" | "no_data" | "provider_failed" | "stale" | "conflicting" | "unsupported", retryable = false, area = false): PlanEvidence => ({ status: "unknown", claim, scope: area ? areaScope : routeScope, reason, retryable });
  const service = unknown("Ride and transit service at planned time", "unsupported");
  const plannedInstant = instantForLocal(local, timeZone);
  const daylightFor = (instant: Date | null): PlanEvidence => instant && Math.abs(from.lat) <= 72
    ? (() => { const value = daylightAt(instant, from); return value === "uncertain" ? unknown("Daylight at planned departure", "conflicting", false, true) : { status: "known" as const, claim: "Daylight at planned departure", value, scope: areaScope, source: { id: "noaa-solar-equations", label: "NOAA solar-position calculation (approximate; weather and shade excluded)", observedAt: checkedAt.toISOString(), expiresAt: null } }; })()
    : unknown("Daylight at planned departure", "unsupported", false, true);
  const constraints = planRequirements(intent?.constraints ?? [], []);
  const manualPlan = intent && intent.mode !== "walk" ? { mode: intent.mode, serviceEligible: false as const, nextSteps: ["Confirm operation at the planned local time with the operator or provider.", intent.mode === "ride" ? "Confirm pickup point, fare and driver availability directly." : "Confirm departure, stops, connections and last service directly.", "Confirm access at the destination and the last walking leg. No booking or service confirmation has been made."] } : undefined;
  const base: PlanOptionsResult = { state: "missing", checkedAt: checkedAt.toISOString(), source: sourceAt ? "OpenStreetMap imported walking graph" : null, sourceAt: sourceAt?.toISOString() ?? null, scope: intent?.loop ? "A loop from the start you chose" : "Between the start and destination you chose", options: [], daylight: daylightFor(intent?.timeKind === "arrive_by" ? null : plannedInstant), service, constraints, manualPlan, targetMeters: intent?.loop ? loopTargetMeters(intent) : undefined, detail: "Walking graph has not been imported for this area." };
  const baselineLater = base.daylight.status === "known" && base.daylight.value === "dark" ? laterDaylight(local, timeZone, from) : null;
  base.timeAlternatives = baselineLater ? [{ ...baselineLater, timeZone, daylight: "daylight" }] : [];
  if (manualPlan) return { ...base, state: "empty", detail: "No eligible planned-time ride or transit source is enabled in this comparison. Keep a manual transfer plan and confirm operation, timing and access directly." };
  if (input.failed) return { ...base, state: "failed", detail: "The walking graph check failed. Retry later." };
  if (!graph || !sourceAt || !routes) return base;
  if (checkedAt.getTime() - sourceAt.getTime() > GRAPH_MAX_AGE_MS || sourceAt.getTime() > checkedAt.getTime()) return { ...base, state: "stale", detail: "The walking graph snapshot is too old to compare routes." };
  if (!plannedInstant) return { ...base, state: "empty", detail: "This local time is ambiguous or unavailable in the chosen time zone. Choose another time before comparing." };
  if (!routes.ok || !routes.routes.length) return { ...base, state: "empty", detail: routes.reason === "not_near_walkway" ? "One place is outside the imported walking network." : routes.reason === "loop_target_unavailable" ? "No mapped loop or out-and-back near the requested distance was found within the bounded graph search. Choose a different distance, starting place or a manual plan." : "No connected walking path was found in the imported graph." };
  const run = intent?.mode === "walk" && /\b(run|running|jog|jogging)\b/i.test(intent.activity);
  const pace = pedestrianPace(intent?.mode === "walk" ? intent : undefined);
  const options: PlanOption[] = routes.routes.map((route) => {
    const minutes = Math.max(1, Math.ceil(route.lengthM / 1_000 * pace));
    const departure = intent?.timeKind === "arrive_by" ? new Date(plannedInstant.getTime() - minutes * 60_000) : plannedInstant;
    const arrival = new Date(departure.getTime() + minutes * 60_000);
    const kind = route.label === "Loop" ? "loop" : route.label === "Out-and-back" ? "out_and_back" : run ? "run" : "walk";
    const activity = run ? "run" : "walk";
    const label = route.label === "Loop" ? `Mapped ${activity} loop` : route.label === "Out-and-back" ? `Mapped ${activity} out-and-back` : route.label === "Shortest" ? `Shortest mapped ${activity}` : `Different mapped ${activity}`;
    let pathHash = 2166136261; for (const char of route.path.join(",")) pathHash = Math.imul(pathHash ^ char.charCodeAt(0), 16777619);
    return { id: `${kind}-${(pathHash >>> 0).toString(16)}`, label, kind, minutes, meters: Math.round(route.lengthM),
      geometry: pathCoords(graph, route.path).map((point): [number, number] => [point.lon, point.lat]),
      steps: routeSteps(graph, route.path), originAccessMeters: routes.snap?.from.distanceM,
      departureLocal: localTimeForInstant(departure, timeZone), arrivalLocal: localTimeForInstant(arrival, timeZone), timeZone, daylight: daylightFor(departure),
      evidence: [{ status: "known", claim: `Mapped ${activity} time estimate`, value: minutes, scope: routeScope, source: { id: "osm-walking-graph", label: `© OpenStreetMap contributors (ODbL), imported walking graph; distance at ${pace.toFixed(1)} min/km assumed pace`, observedAt: sourceAt.toISOString(), expiresAt: new Date(sourceAt.getTime() + GRAPH_MAX_AGE_MS).toISOString() } }],
    };
  });
  const departureLocal = options[0].departureLocal!;
  const later = laterDaylight(departureLocal, timeZone, from);
  const daylight = options[0].daylight!;
  const timeAlternatives = daylight.status === "known" && daylight.value === "dark" && later ? [{ ...later, timeZone, daylight: "daylight" as const, ...(intent?.timeKind === "arrive_by" ? { note: "This is a later departure. It requires changing your requested arrival time." } : {}) }] : [];
  return { ...base, state: "ready", options, daylight, timeAlternatives, constraints: planRequirements(intent?.constraints ?? [], options, input.lighting), detail: intent?.loop ? `${options.length} mapped loop/out-and-back option${options.length === 1 ? "" : "s"} near your requested distance. Time uses the assumed pace; access from the starting place to the graph is not verified.` : options.length > 1 ? "Compare distance and time; neither path is a safety recommendation." : "One mapped walking path is available; no distinct alternate met the route criteria." };
}
