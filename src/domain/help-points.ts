import { haversineMeters } from "./pilot";
import { clock12, localTime, openState, openedAt, type LocalTime, type OpenState, type Schedule } from "./opening-hours";

/**
 * Help Points: staffed or open places that may be useful when she wants assistance, or simply
 * wants to move towards somewhere with people and staff around (blueprint §5E). MIRA never
 * calls a place "safe", and never says a place is staffed because map data says "open".
 * Everything here is deterministic, so it is instant, predictable and works without a model:
 * the "I feel unsafe" sheet depends on it. An LLM never ranks or filters Help Points.
 *
 * Classes stay conservative. Clinics, doctors and labs (often shut at night), ATMs, banks,
 * cafés, ordinary shops and bus stops are not Help Points. Convenience stores are a class only
 * where a country turns them on (24-hour stores are common in e.g. Japan or Thailand).
 */

export type HelpClass = "hospital" | "police" | "transit" | "airport" | "hotel" | "pharmacy" | "fuel" | "convenience";

interface ClassInfo {
  label: string;
  emoji: string;
  /**
   * Default class weight, 0–1: a small tie-break after walking time and opening hours, never a
   * tier that lifts a far place over a near one. 0 = off unless her country turns it on.
   */
  weight: number;
  /** Promoted when the situation is "emergency" (police, hospital). */
  emergency: boolean;
  /** Whether staffing depends on opening hours (so unknown hours matter at night). */
  hoursMatter: boolean;
  /** Class default, stated as a default — never as a promise about this place. */
  staffing: string;
}

export const HELP_CLASSES: Record<HelpClass, ClassInfo> = {
  hospital: { label: "Hospital", emoji: "🏥", weight: 1, emergency: true, hoursMatter: false, staffing: "Hospitals with an emergency department are usually open day and night" },
  police: { label: "Police station", emoji: "👮", weight: 1, emergency: true, hoursMatter: false, staffing: "Police stations are often open day and night" },
  transit: { label: "Metro / train station", emoji: "🚇", weight: 1, emergency: false, hoursMatter: true, staffing: "Stations usually have staff while trains are running" },
  airport: { label: "Airport", emoji: "✈️", weight: 1, emergency: false, hoursMatter: true, staffing: "Airports usually have staff and help desks while flights operate" },
  hotel: { label: "Hotel reception", emoji: "🏨", weight: 0.9, emergency: false, hoursMatter: false, staffing: "Hotel receptions are often open late" },
  pharmacy: { label: "Pharmacy", emoji: "💊", weight: 0.9, emergency: false, hoursMatter: true, staffing: "Pharmacies have people at the counter while open" },
  fuel: { label: "Fuel station", emoji: "⛽", weight: 0.8, emergency: false, hoursMatter: true, staffing: "Fuel stations are often open late" },
  convenience: { label: "Convenience store", emoji: "🏪", weight: 0, emergency: false, hoursMatter: true, staffing: "Convenience stores have people at the counter while open" },
};

/** Class weights (0 = off). Country weights and, later, her own preferences are both this shape. */
export type HelpWeights = Partial<Record<HelpClass, number>>;

/**
 * Per-country class weights (blueprint §5E "weight by locale"). Product defaults, not claims
 * about any place: they only reorder near-equal options, and turn convenience stores on where
 * 24-hour stores are common. Countries without an entry use the class defaults.
 */
export const COUNTRY_HELP_WEIGHTS: Record<string, HelpWeights> = {
  JP: { convenience: 0.9 },
  KR: { convenience: 0.9 },
  TW: { convenience: 0.9 },
  TH: { convenience: 0.9 },
  IN: { fuel: 0.9 },
};

export function helpWeightsFor(iso: string | null | undefined): HelpWeights {
  return (iso && COUNTRY_HELP_WEIGHTS[iso.toUpperCase()]) || {};
}

/** A class's effective weight: class default × country weight × her preference (clamped to 0–1.5). */
export function classWeight(cls: HelpClass, weights: HelpWeights = {}, prefer: HelpWeights = {}): number {
  return Math.min(1.5, Math.max(0, (weights[cls] ?? HELP_CLASSES[cls].weight) * (prefer[cls] ?? 1)));
}

export type HelpSource = "google" | "osm";
export const SOURCE_NAME: Record<HelpSource, string> = { google: "Google Maps", osm: "OpenStreetMap" };
/** Short source name for hours lines ("Open now · Google"). */
export const SOURCE_SHORT: Record<HelpSource, string> = { google: "Google", osm: "OpenStreetMap" };

export interface HelpPoint {
  id: string;
  name: string;
  cls: HelpClass;
  lat: number;
  lon: number;
  /** True only when the source itself lists the place as open 24 hours. */
  open24h: boolean;
  /** Opening hours as the source lists them (text), or null when not listed. */
  hours: string | null;
  /** The same hours, parsed (null when not listed or not understood: then they're "not known"). */
  schedule?: Schedule | null;
  source: HelpSource;
  /** Where the hours came from, when that isn't the place's own source. */
  hoursSource?: HelpSource;
  /**
   * The source's own "open now" (Google `currentOpeningHours.openNow`, which counts special
   * hours such as holidays) and when it said so (epoch ms). Trusted only while fresh.
   */
  openNow?: boolean;
  checkedAt?: number;
  /** On a route: metres from the start of the route to the point nearest this place. */
  alongM?: number;
}

/** OpenStreetMap tags → Help Point class (null = not a Help Point). */
export function helpClassFromOsm(tags: Record<string, string | undefined>): HelpClass | null {
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
  if (tags.amenity === "police") return "police";
  if (tags.amenity === "pharmacy" || tags.healthcare === "pharmacy") return "pharmacy";
  if (tags.amenity === "fuel") return "fuel";
  if (tags.tourism === "hotel") return "hotel";
  if (tags.railway === "station" || tags.railway === "subway_entrance") return "transit";
  // Airports with scheduled service (an IATA code, or tagged international): not airstrips or helipads.
  if (tags.aeroway === "aerodrome" && (tags.iata || tags.aerodrome === "international" || tags["aerodrome:type"] === "international")) return "airport";
  if (tags.shop === "convenience") return "convenience";
  return null;
}

/**
 * Google place types (Places API (New), Table A) we ask for, and what they mean. Bus stations
 * and generic `transit_station`s are left out: the type can't tell a staffed hub from a stop.
 */
export const GOOGLE_HELP_TYPES: Record<string, HelpClass> = {
  hospital: "hospital",
  police: "police",
  subway_station: "transit",
  train_station: "transit",
  light_rail_station: "transit",
  airport: "airport",
  international_airport: "airport",
  hotel: "hotel",
  pharmacy: "pharmacy",
  drugstore: "pharmacy",
  gas_station: "fuel",
  convenience_store: "convenience",
};

/**
 * Only the PRIMARY type counts: Google also lists "hospital" among the secondary types of
 * doctors' practices, labs and health offices, which are not places to go for help at night.
 */
export function helpClassFromGoogle(primaryType: string | undefined): HelpClass | null {
  return (primaryType && GOOGLE_HELP_TYPES[primaryType]) || null;
}

/**
 * Conservative name checks for the two noisiest classes (deterministic, source-independent).
 * In map data "hotel" also covers PGs, room rentals and co-living; "hospital" also covers
 * labs, dispensaries, clinics, suppliers and health offices. None of those is a place to walk to for help.
 */
const NOT_A_HOSPITAL =
  /\b(lab|labs|laborator\w*|diagnostic\w*|dental|dentist|clinic\w*|dispensary|council|pathology|scan|imaging|ayurved\w*|homeopath\w*|pharmaceutical\w*|braces|orthodont\w*|aesthetic\w*|cosmetic\w*|diet|physiotherap\w*|ivf|fertility|medical (?:equipment|supplies|devices))\b/i;
/** A named doctor or a GP practice isn't a hospital ("Dr Khan", "Dr. Mehta's", "… Surgery", "… Medical Centre"). */
const DOCTORS_PRACTICE = /^\s*dr\.?\s|\b(surgery|medical cent(?:re|er)|health cent(?:re|er)|gp|polyclinic)\b/i;
const NOT_A_PHARMACY = /\b(homeopath\w*|ayurved\w*|herbal\w*|wholesale\w*|distributor\w*|pharmaceutical\w*)\b/i;
const HOTEL_NAME = /\b(hotel|hotels|inn|resort)\b/i;
const NOT_A_HOTEL = /\b(pg|paying guest|hostel|co-?living|oyo life)\b/i;

export function plausibleHelpPoint(cls: HelpClass, name: string): boolean {
  if (cls === "hospital") return !NOT_A_HOSPITAL.test(name) && !DOCTORS_PRACTICE.test(name);
  if (cls === "pharmacy") return !NOT_A_PHARMACY.test(name);
  if (cls === "hotel") return HOTEL_NAME.test(name) && !NOT_A_HOTEL.test(name);
  return true;
}

export function isOpen24h(openingHours: string | null | undefined): boolean {
  return /^\s*24\/7\s*$/.test(openingHours ?? "");
}

/** Evening and night, the same window the lighting question uses. */
export function isNight(hour: number): boolean {
  return hour >= 18 || hour < 6;
}

// ── Along a route ───────────────────────────────────────────────────────────────

/** Within this distance of the route line a place counts as "along the way". */
export const CORRIDOR_M = 200;
const MAX_ALONG = 12;

type LonLat = [number, number];

function localXY(p: { lat: number; lon: number }, c: LonLat, k: number) {
  return { x: (c[0] - p.lon) * k, y: (c[1] - p.lat) * 111_320 };
}

/** Where a point sits relative to a [lon, lat] polyline: metres along it, and metres off it. */
export function projectOnRoute(p: { lat: number; lon: number }, geometry: LonLat[]): { alongM: number; offM: number } {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  let best = { alongM: 0, offM: Infinity };
  let walked = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const a = localXY(p, geometry[i], k);
    const b = localXY(p, geometry[i + 1], k);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (len * len))) : 0;
    const off = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (off < best.offM) best = { alongM: walked + t * len, offM: off };
    walked += len;
  }
  return best.offM === Infinity ? { alongM: 0, offM: haversineMeters(p, { lon: geometry[0]?.[0] ?? p.lon, lat: geometry[0]?.[1] ?? p.lat }) } : best;
}

export function routeLengthM(geometry: LonLat[]): number {
  let m = 0;
  for (let i = 0; i < geometry.length - 1; i++) m += haversineMeters({ lon: geometry[i][0], lat: geometry[i][1] }, { lon: geometry[i + 1][0], lat: geometry[i + 1][1] });
  return m;
}

/**
 * Where to look for Help Points along one or more routes: a point every `spacingM` along
 * each route (plus its end), skipping any within `mergeM` of one already chosen, so
 * overlapping alternatives share lookups. Capped, so a long route can't fan out.
 */
export function samplePointsForRoutes(geometries: LonLat[][], spacingM = 900, max = 5, mergeM = 400): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = [];
  const add = (p: { lat: number; lon: number }) => {
    if (out.length < max && !out.some((o) => haversineMeters(o, p) < mergeM)) out.push(p);
  };
  for (const g of geometries) {
    if (!g.length) continue;
    let next = 0;
    let walked = 0;
    for (let i = 0; i < g.length - 1; i++) {
      const a = { lon: g[i][0], lat: g[i][1] };
      const b = { lon: g[i + 1][0], lat: g[i + 1][1] };
      const seg = haversineMeters(a, b);
      while (next <= walked + seg) {
        const t = seg ? (next - walked) / seg : 0;
        add({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
        next += spacingM;
      }
      walked += seg;
    }
    const end = g[g.length - 1];
    add({ lon: end[0], lat: end[1] });
  }
  return out;
}

/** Same place from two lookups: same id, or the same name within ~60 m. Implausible names are dropped too. */
export function dedupeHelpPoints(points: HelpPoint[]): HelpPoint[] {
  const out: HelpPoint[] = [];
  for (const p of points) {
    if (!plausibleHelpPoint(p.cls, p.name)) continue;
    if (out.some((o) => o.id === p.id || (o.name.toLowerCase() === p.name.toLowerCase() && haversineMeters(o, p) < 60))) continue;
    out.push(p);
  }
  return out;
}

/** The candidates that lie along this route, in the order she'd pass them. */
export function helpPointsAlongRoute(candidates: HelpPoint[], geometry: LonLat[]): HelpPoint[] {
  if (geometry.length < 2) return [];
  return dedupeHelpPoints(candidates)
    .map((p) => ({ p, at: projectOnRoute(p, geometry) }))
    .filter(({ at }) => at.offM <= CORRIDOR_M)
    .sort((a, b) => a.at.alongM - b.at.alongM)
    .slice(0, MAX_ALONG)
    .map(({ p, at }) => ({ ...p, alongM: Math.round(at.alongM) }));
}

// ── Ranking for right now ─────────────────────────────────────────────────────────

/** Walking pace used for estimates (4.5 km/h, as in routing) and a street-detour factor. */
const M_PER_MIN = 75;
const DETOUR = 1.25;

export function walkMinutesTo(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  return Math.max(1, Math.round((haversineMeters(from, to) * DETOUR) / M_PER_MIN));
}

/**
 * Why she's looking. Browsing a route, "near me" and "I feel unsafe" treat every class alike
 * (police is one category among several, never automatically first); only "emergency"
 * promotes police and hospitals.
 */
export type HelpSituation = "route" | "nearby" | "unsafe" | "emergency";

/** A source's "open now" is trusted for this long after it was checked; after that, listed hours decide. */
export const OPEN_NOW_FRESH_MS = 20 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * What is known about opening hours right now, and from which source:
 * - `open_24h`: listed as open 24 hours;
 * - `open_now`: the source itself says open now (fresh);
 * - `listed_open`: the listed hours cover now (and her arrival);
 * - `closing`: listed hours end before she'd get there;
 * - `closed`: closed now (source-stated, or per listed hours);
 * - `listed`: hours are listed but MIRA can't read them (shown as text);
 * - `unknown`: no hours listed.
 */
export type HoursState =
  | { kind: "open_24h"; source: HelpSource }
  | { kind: "open_now"; source: HelpSource; closesAt: number | null }
  | { kind: "listed_open"; source: HelpSource; from: number | null; closesAt: number }
  | { kind: "closing"; source: HelpSource; closesAt: number }
  | { kind: "closed"; source: HelpSource; listed: boolean }
  | { kind: "listed"; source: HelpSource; text: string }
  | { kind: "unknown" };

/**
 * Hours for right now on the device's clock (the device is where the place is). `atMs` is the
 * device's epoch time, used only to judge whether the source's own "open now" is still fresh.
 */
export function hoursState(p: HelpPoint, now: LocalTime | undefined, arriveInMin = 0, atMs?: number): HoursState {
  const source = p.hoursSource ?? p.source;
  const age = atMs !== undefined && p.checkedAt !== undefined ? atMs - p.checkedAt : null;
  // `checkedAt` is the server's clock; allow a few minutes of device clock skew, never more.
  const fresh = p.openNow !== undefined && age !== null && age >= -CLOCK_SKEW_MS && age <= OPEN_NOW_FRESH_MS;
  const listed: OpenState = now ? openState(p.schedule, now, arriveInMin) : { state: "unknown" };
  if (fresh && p.openNow === false) return { kind: "closed", source, listed: false }; // e.g. closed for a holiday
  if (p.open24h || p.schedule === "24/7" || (listed.state === "open" && listed.closesAt === null)) return { kind: "open_24h", source };
  if (listed.state === "closing") return { kind: "closing", source, closesAt: listed.closesAt };
  if (fresh && p.openNow) return { kind: "open_now", source, closesAt: listed.state === "open" ? listed.closesAt : null };
  if (listed.state === "open") return { kind: "listed_open", source, from: now ? openedAt(p.schedule, now) : null, closesAt: listed.closesAt! };
  if (listed.state === "closed") return { kind: "closed", source, listed: true };
  if (p.hours) return { kind: "listed", source, text: p.hours };
  return { kind: "unknown" };
}

function toOpenState(h: HoursState): OpenState {
  switch (h.kind) {
    case "open_24h":
      return { state: "open", closesAt: null };
    case "open_now":
    case "listed_open":
      return { state: "open", closesAt: h.closesAt };
    case "closing":
      return { state: "closing", closesAt: h.closesAt };
    case "closed":
      return { state: "closed" };
    default:
      return { state: "unknown" };
  }
}

export interface RankedHelpPoint extends HelpPoint {
  /** Estimated walk from where she is now (straight line × detour; an estimate, labelled as one). */
  minutes: number;
  /** During a trip: true when it's ahead of her on the route, false when behind, null without a route. */
  ahead: boolean | null;
  /** At night, a class whose staffing depends on hours and whose hours aren't known. */
  mayBeClosed: boolean;
  /** Open now (and still when she'd arrive)? Kept for older callers; `hoursNow` says how it's known. */
  open: OpenState;
  hoursNow: HoursState;
}

export interface RankOptions {
  situation: HelpSituation;
  night: boolean;
  route?: LonLat[] | null;
  /** The device's local time (the device is where the place is). Without it, hours are "not known". */
  now?: LocalTime;
  /** The device's epoch ms, to judge freshness of a source's "open now" (defaults to the current time when `now` is given). */
  at?: number;
  /** Classes she chose not to see (e.g. police). */
  exclude?: readonly HelpClass[];
  /** Country weights (helpWeightsFor(iso)). */
  weights?: HelpWeights;
  /** Her own preferences, multiplied in (0.5 = less often, 0 = never). No UI yet. */
  prefer?: HelpWeights;
}

/**
 * Penalties, in minutes of walking: how much further she'd reasonably walk for a better option.
 * Walking time dominates; these only break near-ties.
 */
const AVAILABILITY_MIN = { open: 0, listedOpen: 1, unknownDay: 2, unknownNight: 3, unknownNightHoursMatter: 6 } as const;
const BEHIND_MIN: Record<HelpSituation, number> = { route: 4, nearby: 2, unsafe: 2, emergency: 2 };
const CLASS_SPAN_MIN = 3;
const EMERGENCY_BONUS_MIN = 5;

function availabilityPenalty(h: HoursState, night: boolean, hoursMatter: boolean): number {
  if (h.kind === "open_24h" || h.kind === "open_now") return AVAILABILITY_MIN.open;
  if (h.kind === "listed_open") return AVAILABILITY_MIN.listedOpen;
  if (!night) return AVAILABILITY_MIN.unknownDay;
  return hoursMatter ? AVAILABILITY_MIN.unknownNightHoursMatter : AVAILABILITY_MIN.unknownNight;
}

/**
 * Order Help Points by immediate usefulness (blueprint §5E), deterministically:
 * 1. leave out places known closed now, or closing before she'd arrive, and classes she excluded
 *    (or that are off: weight 0, e.g. convenience stores outside the countries that turn them on);
 * 2. walking time, with a preference for places likely open now: open now or 24 h (source) >
 *    listed hours that are open now > hours not known by day > hours not known at night (and
 *    labelled "may be closed" when the class depends on hours);
 * 3. during a trip, places ahead of her over places behind;
 * 4. class weight (class default × country × her preference) as a small tie-break;
 * 5. in an emergency only, police and hospitals are promoted.
 */
export function rankHelpPoints(points: HelpPoint[], from: { lat: number; lon: number }, opts: RankOptions): RankedHelpPoint[] {
  const route = opts.route && opts.route.length > 1 ? opts.route : null;
  const myAlong = route ? projectOnRoute(from, route).alongM : 0;
  const at = opts.at ?? (opts.now ? Date.now() : undefined);
  return dedupeHelpPoints(points)
    .filter((p) => !opts.exclude?.includes(p.cls))
    .map((p) => ({ p, w: classWeight(p.cls, opts.weights, opts.prefer) }))
    .filter(({ w }) => w > 0)
    .map(({ p, w }) => {
      const info = HELP_CLASSES[p.cls];
      const minutes = walkMinutesTo(from, p);
      const hoursNow = hoursState(p, opts.now, minutes, at);
      const unknown = hoursNow.kind === "unknown" || hoursNow.kind === "listed";
      const mayBeClosed = opts.night && info.hoursMatter && unknown;
      const ahead = route ? projectOnRoute(p, route).alongM >= myAlong - 50 : null;
      const key =
        minutes +
        availabilityPenalty(hoursNow, opts.night, info.hoursMatter) +
        (ahead === false ? BEHIND_MIN[opts.situation] : 0) +
        (1 - Math.min(w, 1)) * CLASS_SPAN_MIN -
        (opts.situation === "emergency" && info.emergency ? EMERGENCY_BONUS_MIN : 0);
      return { p: { ...p, minutes, ahead, mayBeClosed, open: toOpenState(hoursNow), hoursNow }, key, w };
    })
    // Known closed now, or closing before she'd get there: not a place to go.
    .filter(({ p }) => p.hoursNow.kind !== "closed" && p.hoursNow.kind !== "closing")
    .sort((a, b) => a.key - b.key || a.p.minutes - b.p.minutes || b.w - a.w || a.p.name.localeCompare(b.p.name) || a.p.id.localeCompare(b.p.id))
    .map(({ p }) => p);
}

/**
 * Help Points for an emergency: the same rules, with police and hospitals promoted. Pure apart
 * from reading the clock when `now` isn't given. For Mira and the emergency context (no UI yet).
 */
export function emergencyHelpPoints(
  points: HelpPoint[],
  me: { lat: number; lon: number },
  opts: { now?: Date; exclude?: readonly HelpClass[]; weights?: HelpWeights; route?: LonLat[] | null } = {},
): RankedHelpPoint[] {
  const d = opts.now ?? new Date();
  return rankHelpPoints(points, me, { situation: "emergency", night: isNight(d.getHours()), now: localTime(d), at: d.getTime(), exclude: opts.exclude, weights: opts.weights, route: opts.route });
}

// ── Copy (templates only; no verdicts) ────────────────────────────────────────────

/**
 * One line about hours, always with its source, never "staffed":
 * "Open 24 hours (listed) · Google", "Open now · Google", "Listed 9 AM–9 PM · OpenStreetMap",
 * "Closes 9 PM, before you'd get there (listed) · Google", "Hours not known" (+ "may be closed
 * now" at night). Pass a ranked point (its `hoursNow` was computed on the device).
 */
export function hoursLine(p: HelpPoint & { mayBeClosed?: boolean; hoursNow?: HoursState }): string {
  const h = p.hoursNow ?? hoursState(p, undefined);
  const src = (s: HelpSource) => ` · ${SOURCE_SHORT[s]}`;
  switch (h.kind) {
    case "open_24h":
      return `Open 24 hours (listed)${src(h.source)}`;
    case "open_now":
      return h.closesAt === null ? `Open now${src(h.source)}` : `Open now, listed until ${clock12(h.closesAt)}${src(h.source)}`;
    case "listed_open":
      return `Listed ${h.from === null ? "until " : `${clock12(h.from)}–`}${clock12(h.closesAt)}${src(h.source)}`;
    case "closing":
      return `Closes ${clock12(h.closesAt)}, before you'd get there (listed)${src(h.source)}`;
    case "closed":
      return `Closed now${h.listed ? " (listed hours)" : ""}${src(h.source)}`;
    case "listed":
      return `Listed: ${h.text.slice(0, 40)}${src(h.source)}`;
    default:
      return p.mayBeClosed ? "Hours not known · may be closed now" : "Hours not known";
  }
}

/** Short form for compact rows: "open now", "open 24 h (listed)", "listed hours", "hours not known". */
export function hoursShort(h: HoursState, mayBeClosed = false): string {
  switch (h.kind) {
    case "open_24h":
      return "open 24 h (listed)";
    case "open_now":
      return "open now";
    case "listed_open":
      return `listed until ${clock12(h.closesAt)}`;
    case "listed":
      return "listed hours";
    case "unknown":
      return mayBeClosed ? "may be closed" : "hours not known";
    default:
      return "";
  }
}

export function minutesIn(alongM: number): string {
  const m = Math.round(alongM / M_PER_MIN);
  return m < 1 ? "at the start" : `${m} min in`;
}
