import { haversineMeters } from "./pilot";
import { clockLabel, openState, type LocalTime, type OpenState, type Schedule } from "./opening-hours";

/**
 * Help Points: nearby places where help is likely to be available — staffed, open,
 * reachable (blueprint §5E). MIRA never calls a place "safe". Everything here is
 * deterministic, so it is instant, predictable and works without a model: the
 * "I feel unsafe" sheet depends on it. An LLM never ranks or filters Help Points.
 *
 * Classes start conservative. Clinics and doctors (often shut at night), ATMs, banks,
 * cafés, shops and bus stops are not Help Points.
 */

export type HelpClass = "hospital" | "police" | "transit" | "hotel" | "pharmacy" | "fuel";

interface ClassInfo {
  label: string;
  emoji: string;
  /** 1 = staffed around the clock or while operating; 2 = staffed while open. */
  tier: 1 | 2;
  /** Whether staffing depends on opening hours (so unknown hours matter at night). */
  hoursMatter: boolean;
  /** Class default, stated as a default — never as a promise about this place. */
  staffing: string;
}

export const HELP_CLASSES: Record<HelpClass, ClassInfo> = {
  hospital: { label: "Hospital", emoji: "🏥", tier: 1, hoursMatter: false, staffing: "Hospitals are usually staffed day and night" },
  police: { label: "Police station", emoji: "👮", tier: 1, hoursMatter: false, staffing: "Police stations are usually staffed day and night" },
  transit: { label: "Metro / train station", emoji: "🚇", tier: 1, hoursMatter: true, staffing: "Stations have staff while trains are running" },
  hotel: { label: "Hotel reception", emoji: "🏨", tier: 2, hoursMatter: false, staffing: "Hotel receptions are often open late" },
  pharmacy: { label: "Pharmacy", emoji: "💊", tier: 2, hoursMatter: true, staffing: "Pharmacies are staffed while open" },
  fuel: { label: "Fuel station", emoji: "⛽", tier: 2, hoursMatter: true, staffing: "Fuel stations are often open late" },
};

export type HelpSource = "google" | "osm";
export const SOURCE_NAME: Record<HelpSource, string> = { google: "Google Maps", osm: "OpenStreetMap" };

export interface HelpPoint {
  id: string;
  name: string;
  cls: HelpClass;
  lat: number;
  lon: number;
  /** True only when the source itself says the place is open 24/7. */
  open24h: boolean;
  /** Opening hours exactly as the source lists them, or null when not listed. */
  hours: string | null;
  /** The same hours, parsed (null when not listed or not understood: then they're "not known"). */
  schedule?: Schedule | null;
  source: HelpSource;
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
  return null;
}

/** Google place types (Places API (New), Table A) we ask for, and what they mean. */
export const GOOGLE_HELP_TYPES: Record<string, HelpClass> = {
  hospital: "hospital",
  police: "police",
  subway_station: "transit",
  train_station: "transit",
  light_rail_station: "transit",
  hotel: "hotel",
  pharmacy: "pharmacy",
  drugstore: "pharmacy",
  gas_station: "fuel",
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
 * labs, dispensaries and health offices. None of those is a place to walk to for help.
 */
const NOT_A_HOSPITAL = /\b(lab|labs|laborator\w*|diagnostic\w*|dental|dentist|clinic|dispensary|council|pathology|scan|imaging|ayurved\w*|homeopath\w*)\b/i;
const HOTEL_NAME = /\b(hotel|hotels|inn|resort)\b/i;
const NOT_A_HOTEL = /\b(pg|paying guest|hostel|co-?living|oyo life)\b/i;

export function plausibleHelpPoint(cls: HelpClass, name: string): boolean {
  if (cls === "hospital") return !NOT_A_HOSPITAL.test(name);
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

export interface RankedHelpPoint extends HelpPoint {
  /** Estimated walk from where she is now (straight line × detour; an estimate, labelled as one). */
  minutes: number;
  /** During a trip: true when it's ahead of her on the route, false when behind, null without a route. */
  ahead: boolean | null;
  /** At night, a class whose staffing depends on hours and whose hours aren't known. */
  mayBeClosed: boolean;
  /** From listed hours, on the device's clock: open now (and still when she'd arrive)? */
  open: OpenState;
}

/**
 * Order Help Points by immediate usefulness (blueprint §5E), deterministically:
 * walking time first; Tier 1 preferred over Tier 2 when within ~2 minutes; at night a
 * place whose hours matter but aren't known is demoted (still shown, and labelled);
 * during a trip, places behind her are slightly demoted.
 */
export function rankHelpPoints(
  points: HelpPoint[],
  from: { lat: number; lon: number },
  opts: { night: boolean; route?: LonLat[] | null; now?: LocalTime; exclude?: readonly HelpClass[] },
): RankedHelpPoint[] {
  const route = opts.route && opts.route.length > 1 ? opts.route : null;
  const myAlong = route ? projectOnRoute(from, route).alongM : 0;
  return dedupeHelpPoints(points)
    .filter((p) => !opts.exclude?.includes(p.cls))
    .map((p) => {
      const info = HELP_CLASSES[p.cls];
      const minutes = walkMinutesTo(from, p);
      const open: OpenState = p.open24h ? { state: "open", closesAt: null } : opts.now ? openState(p.schedule, opts.now, minutes) : { state: "unknown" };
      const mayBeClosed = opts.night && info.hoursMatter && open.state === "unknown";
      const ahead = route ? projectOnRoute(p, route).alongM >= myAlong - 50 : null;
      const key = minutes + (info.tier - 1) * 2 + (mayBeClosed ? 3 : 0) + (ahead === false ? 1 : 0);
      return { p: { ...p, minutes, ahead, mayBeClosed, open }, key };
    })
    // Known closed now, or closing before she'd get there (listed hours): not a place to go.
    .filter(({ p }) => p.open.state !== "closed" && p.open.state !== "closing")
    .sort((a, b) => a.key - b.key || a.p.minutes - b.p.minutes || a.p.name.localeCompare(b.p.name))
    .map(({ p }) => p);
}

// ── Copy (templates only; no verdicts) ────────────────────────────────────────────

/**
 * "Open 24h", "Open until 21:00 (listed)", "Closed now (listed hours)", "Listed hours: …",
 * "Hours not known", plus a night caveat. Pass `open` (computed on the device) when known.
 */
export function hoursLine(p: HelpPoint & { mayBeClosed?: boolean; open?: OpenState }): string {
  if (p.open24h || (p.open?.state === "open" && p.open.closesAt === null)) return "Open 24h";
  if (p.open?.state === "open") return `Open until ${clockLabel(p.open.closesAt!)} (listed)`;
  if (p.open?.state === "closing") return `Closes ${clockLabel(p.open.closesAt)}, before you'd get there (listed)`;
  if (p.open?.state === "closed") return "Closed now (listed hours)";
  if (p.hours) return `Listed hours: ${p.hours.slice(0, 40)}`;
  return p.mayBeClosed ? "Hours not known · may be closed now" : "Hours not known";
}

export function minutesIn(alongM: number): string {
  const m = Math.round(alongM / M_PER_MIN);
  return m < 1 ? "at the start" : `${m} min in`;
}
