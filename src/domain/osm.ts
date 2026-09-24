/**
 * Pure OSM → MIRA transformation (architecture §2). No I/O, so it runs identically
 * for the real pilot import and for test-only fixtures.
 *
 * Rules:
 *  - Places come only from OSM tags; missing tags stay missing (never inferred).
 *  - Walkable ways respect foot/access restrictions and pedestrian one-way rules.
 *  - Ways are clipped to the pilot bounds and split at shared nodes (intersections).
 */
import { haversineMeters, inBounds, type Bounds, type LatLon } from "./pilot";

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}
export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
export type OsmElement = OsmNode | OsmWay | { type: "relation"; id: number };

export type PlaceType =
  | "metro"
  | "rail"
  | "bus"
  | "pharmacy"
  | "health"
  | "police"
  | "education"
  | "library"
  | "accommodation"
  | "food"
  | "shop"
  | "finance"
  | "toilets"
  | "park"
  | "sports"
  | "community"
  | "government"
  | "landmark"
  | "transport_other";

export interface PlaceRecord {
  osmType: "node" | "way";
  osmId: number;
  name: string | null;
  nameHi: string | null;
  placeType: PlaceType;
  kindLabel: string;
  point: LatLon;
  tags: Record<string, string>;
  searchText: string;
}

/** OSM keys MIRA keeps for display. Everything else is discarded at import. */
export const PLACE_TAG_ALLOWLIST = [
  "name",
  "name:en",
  "name:hi",
  "alt_name",
  "official_name",
  "amenity",
  "shop",
  "railway",
  "station",
  "subway",
  "public_transport",
  "bus",
  "highway",
  "healthcare",
  "tourism",
  "leisure",
  "building",
  "office",
  "historic",
  "opening_hours",
  "wheelchair",
  "operator",
  "ref",
  "level",
  "network",
  "dispensing",
  "emergency",
  "toilets:wheelchair",
  "fee",
  "access",
  "addr:street",
] as const;

const TITLE = (v: string) => v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const AMENITY_LABELS: Record<string, [PlaceType, string]> = {
  pharmacy: ["pharmacy", "Pharmacy"],
  hospital: ["health", "Hospital"],
  clinic: ["health", "Clinic"],
  doctors: ["health", "Doctor"],
  dentist: ["health", "Dentist"],
  police: ["police", "Police"],
  university: ["education", "University"],
  college: ["education", "College"],
  school: ["education", "School"],
  prep_school: ["education", "Coaching / tuition centre"],
  research_institute: ["education", "Research institute"],
  library: ["library", "Library"],
  dormitory: ["accommodation", "Dormitory"],
  cafe: ["food", "Café"],
  restaurant: ["food", "Restaurant"],
  fast_food: ["food", "Fast food"],
  food_court: ["food", "Food court"],
  ice_cream: ["food", "Ice cream"],
  bank: ["finance", "Bank"],
  atm: ["finance", "ATM"],
  bureau_de_change: ["finance", "Currency exchange"],
  toilets: ["toilets", "Toilets"],
  community_centre: ["community", "Community centre"],
  place_of_worship: ["community", "Place of worship"],
  post_office: ["community", "Post office"],
  townhall: ["government", "Town hall"],
  conference_centre: ["community", "Conference centre"],
  arts_centre: ["community", "Arts centre"],
  bus_station: ["bus", "Bus station"],
  bicycle_rental: ["transport_other", "Bicycle rental"],
  taxi: ["transport_other", "Taxi stand"],
};

/** Types that are useful context even when OSM has no name for them. */
const UNNAMED_OK = new Set<PlaceType>(["pharmacy", "toilets", "finance", "bus", "metro", "police", "health"]);

export function classifyPlace(tags: Record<string, string>): { placeType: PlaceType; kindLabel: string } | null {
  const t = tags;
  if (t.railway === "subway_entrance") return { placeType: "metro", kindLabel: "Metro entrance" };
  if (t.railway === "station" || (t.public_transport === "station" && t.railway !== "halt")) {
    const isMetro = t.station === "subway" || t.subway === "yes";
    return isMetro
      ? { placeType: "metro", kindLabel: "Metro station" }
      : { placeType: "rail", kindLabel: "Station" };
  }
  if (t.highway === "bus_stop" || (t.public_transport === "platform" && t.bus === "yes")) {
    return { placeType: "bus", kindLabel: "Bus stop" };
  }
  if (t.healthcare === "pharmacy") return { placeType: "pharmacy", kindLabel: "Pharmacy" };
  if (t.amenity && AMENITY_LABELS[t.amenity]) {
    const [placeType, kindLabel] = AMENITY_LABELS[t.amenity];
    return { placeType, kindLabel };
  }
  if (t.healthcare) return { placeType: "health", kindLabel: TITLE(t.healthcare) };
  if (t.tourism === "hostel") return { placeType: "accommodation", kindLabel: "Hostel" };
  if (t.tourism === "hotel") return { placeType: "accommodation", kindLabel: "Hotel" };
  if (t.tourism === "guest_house") return { placeType: "accommodation", kindLabel: "Guest house" };
  if (t.building === "dormitory") return { placeType: "accommodation", kindLabel: "Residence hall" };
  if (t.shop) {
    // shop=chemist in OSM is a toiletries/household shop, not a pharmacy.
    const label = t.shop === "chemist" ? "Chemist (toiletries) shop" : `${TITLE(t.shop)} shop`;
    return { placeType: "shop", kindLabel: label };
  }
  if (t.leisure === "park" || t.leisure === "garden") return { placeType: "park", kindLabel: TITLE(t.leisure) };
  if (t.leisure === "sports_centre" || t.leisure === "stadium" || t.leisure === "pitch") {
    return { placeType: "sports", kindLabel: TITLE(t.leisure) };
  }
  if (t.office === "educational_institution") return { placeType: "education", kindLabel: "Educational institution" };
  if (t.office === "government") return { placeType: "government", kindLabel: "Government office" };
  if (t.building === "university") return { placeType: "education", kindLabel: "University building" };
  if (t.building === "college") return { placeType: "education", kindLabel: "College building" };
  if (t.tourism === "museum") return { placeType: "landmark", kindLabel: "Museum" };
  if (t.tourism === "attraction" || t.historic) return { placeType: "landmark", kindLabel: "Landmark" };
  if (t.building && t.building !== "yes" && t.name) return { placeType: "landmark", kindLabel: TITLE(t.building) };
  if (t.building === "yes" && t.name) return { placeType: "landmark", kindLabel: "Building" };
  return null;
}

export function pickTags(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PLACE_TAG_ALLOWLIST) {
    const v = tags[k];
    if (typeof v === "string" && v.trim() !== "" && v.length <= 255) out[k] = v.trim();
  }
  return out;
}

function centroid(points: LatLon[]): LatLon {
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / points.length, lon: lon / points.length };
}

export function buildPlaces(elements: OsmElement[], bounds: Bounds): PlaceRecord[] {
  const nodes = new Map<number, OsmNode>();
  for (const e of elements) if (e.type === "node") nodes.set(e.id, e);
  const out: PlaceRecord[] = [];
  const seen = new Set<string>();

  const consider = (osmType: "node" | "way", osmId: number, tags: Record<string, string> | undefined, point: LatLon | null) => {
    if (!tags || !point) return;
    const cls = classifyPlace(tags);
    if (!cls) return;
    const name = (tags.name ?? tags["name:en"] ?? "").trim() || null;
    if (!name && !UNNAMED_OK.has(cls.placeType)) return;
    if (!inBounds(point, bounds)) return;
    const key = `${osmType}/${osmId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const picked = pickTags(tags);
    const nameHi = tags["name:hi"]?.trim() || null;
    const searchText = [name, tags["name:en"], nameHi, tags.alt_name, tags.official_name, tags.ref, cls.kindLabel]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    out.push({ osmType, osmId, name, nameHi, placeType: cls.placeType, kindLabel: cls.kindLabel, point, tags: picked, searchText });
  };

  for (const e of elements) {
    if (e.type === "node") {
      if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
      consider("node", e.id, e.tags, { lat: e.lat, lon: e.lon });
    } else if (e.type === "way") {
      if (e.tags?.highway && !e.tags.amenity && !e.tags.railway) continue; // streets are not places
      const pts = e.nodes.map((id) => nodes.get(id)).filter((n): n is OsmNode => !!n).map((n) => ({ lat: n.lat, lon: n.lon }));
      if (pts.length === 0 || pts.length !== e.nodes.length) continue; // incomplete geometry
      const unique = pts.length > 1 && e.nodes[0] === e.nodes[e.nodes.length - 1] ? pts.slice(0, -1) : pts;
      consider("way", e.id, e.tags, centroid(unique));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Walking graph
// ---------------------------------------------------------------------------

const WALKABLE_HIGHWAYS = new Set([
  "footway",
  "path",
  "pedestrian",
  "steps",
  "living_street",
  "residential",
  "service",
  "unclassified",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
  "track",
  "cycleway",
  "corridor",
  "road",
  "platform",
  "bridleway",
]);
const FOOT_ALLOWED = new Set(["yes", "designated", "permissive", "destination"]);
const FOOT_FORBIDDEN = new Set(["no", "private", "use_sidepath"]);
const ACCESS_FORBIDDEN = new Set(["no", "private"]);
const MOTOR_ONLY = new Set(["motorway", "motorway_link", "trunk", "trunk_link"]);
const PEDESTRIAN_WAYS = new Set(["footway", "path", "pedestrian", "steps", "corridor"]);

export type Direction = "both" | "forward" | "backward";

export function walkability(tags: Record<string, string> | undefined): Direction | null {
  if (!tags?.highway) return null;
  const hw = tags.highway;
  const foot = tags.foot;
  if (foot && FOOT_FORBIDDEN.has(foot)) return null;
  if (MOTOR_ONLY.has(hw)) {
    if (!foot || !FOOT_ALLOWED.has(foot)) return null;
  } else if (!WALKABLE_HIGHWAYS.has(hw)) {
    return null;
  }
  if (hw === "bridleway" && !(foot && FOOT_ALLOWED.has(foot))) return null;
  if (tags.access && ACCESS_FORBIDDEN.has(tags.access) && !(foot && FOOT_ALLOWED.has(foot))) return null;
  if (tags.area === "yes" && hw !== "pedestrian") return null;
  // Pedestrian one-way rules: oneway:foot always applies; oneway applies only to
  // pedestrian-only ways (a car one-way street stays two-way for walkers).
  const onewayFoot = tags["oneway:foot"];
  if (onewayFoot === "yes" || onewayFoot === "true" || onewayFoot === "1") return "forward";
  if (onewayFoot === "-1") return "backward";
  if (PEDESTRIAN_WAYS.has(hw)) {
    if (tags.oneway === "yes" || tags.oneway === "true" || tags.oneway === "1") return "forward";
    if (tags.oneway === "-1") return "backward";
  }
  return "both";
}

export const EDGE_TAG_ALLOWLIST = ["highway", "footway", "sidewalk", "foot", "surface", "lit", "incline", "wheelchair", "name", "oneway:foot", "access"] as const;

export interface GraphNode {
  id: number;
  lat: number;
  lon: number;
}
export interface GraphEdge {
  from: number;
  to: number;
  coords: LatLon[];
  lengthM: number;
  wayId: number;
  tags: Record<string, string>;
}
export interface WalkGraph {
  nodes: Map<number, GraphNode>;
  edges: GraphEdge[];
}

function pickEdgeTags(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of EDGE_TAG_ALLOWLIST) if (tags[k]) out[k] = tags[k];
  return out;
}

function polylineLength(coords: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineMeters(coords[i - 1], coords[i]);
  return total;
}

export function buildWalkGraph(elements: OsmElement[], bounds: Bounds): WalkGraph {
  const osmNodes = new Map<number, OsmNode>();
  for (const e of elements) if (e.type === "node") osmNodes.set(e.id, e);

  const walkWays: Array<{ way: OsmWay; dir: Direction }> = [];
  for (const e of elements) {
    if (e.type !== "way") continue;
    const dir = walkability(e.tags);
    if (dir) walkWays.push({ way: e, dir });
  }

  // Count how many walkable-way positions reference each node to find intersections.
  const usage = new Map<number, number>();
  for (const { way } of walkWays) {
    const uniq = new Set(way.nodes);
    for (const id of uniq) usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  const nodes = new Map<number, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (from: number, to: number, coords: LatLon[], way: OsmWay, dir: Direction) => {
    if (from === to || coords.length < 2) return;
    const lengthM = polylineLength(coords);
    if (!(lengthM > 0.05)) return;
    const tags = pickEdgeTags(way.tags ?? {});
    const push = (a: number, b: number, c: LatLon[]) => {
      const key = `${a}>${b}@${way.id}@${Math.round(lengthM * 10)}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({ from: a, to: b, coords: c, lengthM, wayId: way.id, tags });
    };
    if (dir === "both" || dir === "forward") push(from, to, coords);
    if (dir === "both" || dir === "backward") push(to, from, [...coords].reverse());
  };

  for (const { way, dir } of walkWays) {
    // Split the way into runs of consecutive in-bounds, known nodes (clipping).
    const runs: number[][] = [];
    let current: number[] = [];
    for (const id of way.nodes) {
      const n = osmNodes.get(id);
      const ok = n && Number.isFinite(n.lat) && Number.isFinite(n.lon) && inBounds({ lat: n.lat, lon: n.lon }, bounds);
      if (ok) {
        current.push(id);
      } else {
        if (current.length >= 2) runs.push(current);
        current = [];
      }
    }
    if (current.length >= 2) runs.push(current);

    for (const run of runs) {
      let segStart = 0;
      for (let i = 1; i < run.length; i++) {
        const id = run[i];
        const isEnd = i === run.length - 1;
        const isIntersection = (usage.get(id) ?? 0) > 1;
        // Closed loops: force a split before returning to the segment's start node.
        const loopsBack = run.slice(segStart, i).includes(id);
        if (loopsBack && i - 1 > segStart) {
          emit(run, segStart, i - 1, way, dir);
          segStart = i - 1;
        }
        if (isEnd || isIntersection) {
          emit(run, segStart, i, way, dir);
          segStart = i;
        }
      }
    }
  }

  function emit(run: number[], a: number, b: number, way: OsmWay, dir: Direction) {
    const ids = run.slice(a, b + 1);
    const coords = ids.map((id) => {
      const n = osmNodes.get(id)!;
      return { lat: n.lat, lon: n.lon };
    });
    const from = ids[0];
    const to = ids[ids.length - 1];
    if (from === to) return;
    for (const id of [from, to]) {
      if (!nodes.has(id)) {
        const n = osmNodes.get(id)!;
        nodes.set(id, { id, lat: n.lat, lon: n.lon });
      }
    }
    addEdge(from, to, coords, way, dir);
  }

  return { nodes, edges };
}

/** Weakly connected components (edge direction ignored). Returns node → component index, largest = 0. */
export function connectedComponents(graph: WalkGraph): { componentOf: Map<number, number>; sizes: number[] } {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const id of graph.nodes.keys()) parent.set(id, id);
  for (const e of graph.edges) {
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<number, number[]>();
  for (const id of graph.nodes.keys()) {
    const r = find(id);
    const g = groups.get(r) ?? [];
    g.push(id);
    groups.set(r, g);
  }
  const ordered = [...groups.values()].sort((x, y) => y.length - x.length || x[0] - y[0]);
  const componentOf = new Map<number, number>();
  ordered.forEach((ids, idx) => ids.forEach((id) => componentOf.set(id, idx)));
  return { componentOf, sizes: ordered.map((g) => g.length) };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  stats: { places: number; nodes: number; edges: number; components: number; largestComponent: number };
}

export function validateImport(places: PlaceRecord[], graph: WalkGraph, bounds: Bounds, minLargestComponent = 50): ValidationResult {
  const errors: string[] = [];
  const placeKeys = new Set<string>();
  for (const p of places) {
    const key = `${p.osmType}/${p.osmId}`;
    if (placeKeys.has(key)) errors.push(`duplicate place ${key}`);
    placeKeys.add(key);
    if (!inBounds(p.point, bounds)) errors.push(`place ${key} outside pilot bounds`);
    if (!Number.isSafeInteger(p.osmId) || p.osmId <= 0) errors.push(`place ${key} has invalid OSM id`);
  }
  for (const n of graph.nodes.values()) {
    if (!inBounds(n, bounds)) errors.push(`walk node ${n.id} outside pilot bounds`);
  }
  for (const e of graph.edges) {
    if (!graph.nodes.has(e.from) || !graph.nodes.has(e.to)) errors.push(`edge ${e.from}>${e.to} references unknown node`);
    if (e.from === e.to) errors.push(`edge ${e.from} is a self-loop`);
    if (!(e.lengthM > 0) || !Number.isFinite(e.lengthM)) errors.push(`edge ${e.from}>${e.to} has invalid length`);
    if (e.coords.some((c) => !inBounds(c, bounds))) errors.push(`edge ${e.from}>${e.to} leaves pilot bounds`);
  }
  const { sizes } = connectedComponents(graph);
  if (places.length === 0) errors.push("no places imported");
  if (graph.edges.length === 0) errors.push("no walkable edges imported");
  if ((sizes[0] ?? 0) < minLargestComponent) {
    errors.push(`largest connected walking component has ${sizes[0] ?? 0} nodes (< ${minLargestComponent})`);
  }
  return {
    ok: errors.length === 0,
    errors: errors.slice(0, 50),
    stats: {
      places: places.length,
      nodes: graph.nodes.size,
      edges: graph.edges.length,
      components: sizes.length,
      largestComponent: sizes[0] ?? 0,
    },
  };
}
