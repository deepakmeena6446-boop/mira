/**
 * Walking routes over the imported OSM graph (architecture §2).
 *
 *  - Cost is edge length only. There is no safety weight, ever.
 *  - Endpoints snap to graph nodes within SNAP_RADIUS_M; otherwise no route.
 *  - At most one alternate: found by penalising the shortest path's edges; it must
 *    have ≥ 20 % of its length on edges the shortest path doesn't use and be no
 *    longer than 1.5 × the shortest. Otherwise only one route is returned.
 *  - Disconnected endpoints return no route. Straight lines are never drawn.
 */
import { haversineMeters, type LatLon } from "./pilot";

export const WALKING_SPEED_KMH = 4.5;
export const SNAP_RADIUS_M = 100;
export const ALT_MIN_DISTINCT_SHARE = 0.2;
export const ALT_MAX_STRETCH = 1.5;

export interface RouteEdge {
  id: number; // index into graph.edges
  from: number;
  to: number;
  lengthM: number;
  wayId: number;
  coords: LatLon[];
  tags: Record<string, string>;
}

export interface RouteGraph {
  nodes: Map<number, LatLon & { component: number }>;
  edges: RouteEdge[];
  out: Map<number, number[]>; // node -> outgoing edge ids
}

export function buildRouteGraph(
  nodes: Array<{ id: number; lat: number; lon: number; component: number }>,
  edges: Array<Omit<RouteEdge, "id">>,
): RouteGraph {
  const nodeMap = new Map<number, LatLon & { component: number }>();
  for (const n of nodes) nodeMap.set(n.id, { lat: n.lat, lon: n.lon, component: n.component });
  const out = new Map<number, number[]>();
  const list: RouteEdge[] = [];
  edges.forEach((e) => {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to) || !(e.lengthM > 0)) return;
    const id = list.length;
    list.push({ ...e, id });
    const arr = out.get(e.from) ?? [];
    arr.push(id);
    out.set(e.from, arr);
  });
  return { nodes: nodeMap, edges: list, out };
}

/** Undirected identity of a street segment, so A→B and B→A count as the same path. */
export function segmentKey(e: RouteEdge): string {
  return e.from < e.to ? `${e.from}-${e.to}-${e.wayId}` : `${e.to}-${e.from}-${e.wayId}`;
}

export interface SnapCandidate {
  node: number;
  distanceM: number;
  component: number;
}

export function snapCandidates(g: RouteGraph, p: LatLon, radiusM = SNAP_RADIUS_M, limit = 40): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  // Cheap bounding pre-filter before haversine.
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  for (const [id, n] of g.nodes) {
    if (Math.abs(n.lat - p.lat) > dLat || Math.abs(n.lon - p.lon) > dLon) continue;
    const d = haversineMeters(p, n);
    if (d <= radiusM) out.push({ node: id, distanceM: d, component: n.component });
  }
  out.sort((a, b) => a.distanceM - b.distanceM || a.node - b.node);
  return out.slice(0, limit);
}

/**
 * Choose origin/destination nodes within the snap radius that share a connected
 * component, minimising the total snap distance.
 */
export function snapPair(
  g: RouteGraph,
  a: LatLon,
  b: LatLon,
): { ok: true; from: SnapCandidate; to: SnapCandidate } | { ok: false; reason: "not_near_walkway" | "no_connected_path" } {
  const ca = snapCandidates(g, a);
  const cb = snapCandidates(g, b);
  if (ca.length === 0 || cb.length === 0) return { ok: false, reason: "not_near_walkway" };
  let best: { from: SnapCandidate; to: SnapCandidate; cost: number } | null = null;
  const bestByComponent = new Map<number, SnapCandidate>();
  for (const c of cb) if (!bestByComponent.has(c.component)) bestByComponent.set(c.component, c);
  for (const c of ca) {
    const partner = bestByComponent.get(c.component);
    if (!partner) continue;
    const cost = c.distanceM + partner.distanceM;
    if (!best || cost < best.cost) best = { from: c, to: partner, cost };
  }
  return best ? { ok: true, from: best.from, to: best.to } : { ok: false, reason: "no_connected_path" };
}

class MinHeap {
  private items: Array<{ k: number; v: number }> = [];
  push(k: number, v: number) {
    const a = this.items;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { k: number; v: number } | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

/** A* with a haversine heuristic. `cost` defaults to edge length; it may only increase it. */
export function shortestPath(g: RouteGraph, from: number, to: number, cost: (e: RouteEdge) => number = (e) => e.lengthM): number[] | null {
  if (from === to) return [];
  const target = g.nodes.get(to);
  if (!target || !g.nodes.has(from)) return null;
  const h = (n: number) => haversineMeters(g.nodes.get(n)!, target) * 0.999;
  const dist = new Map<number, number>([[from, 0]]);
  const via = new Map<number, number>(); // node -> edge id used to reach it
  const heap = new MinHeap();
  heap.push(h(from), from);
  const closed = new Set<number>();
  while (heap.size) {
    const { v } = heap.pop()!;
    if (closed.has(v)) continue;
    if (v === to) break;
    closed.add(v);
    const dv = dist.get(v)!;
    for (const eid of g.out.get(v) ?? []) {
      const e = g.edges[eid];
      const nd = dv + cost(e);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        via.set(e.to, eid);
        heap.push(nd + h(e.to), e.to);
      }
    }
  }
  if (!via.has(to)) return null;
  const path: number[] = [];
  let cur = to;
  while (cur !== from) {
    const eid = via.get(cur)!;
    path.push(eid);
    cur = g.edges[eid].from;
  }
  return path.reverse();
}

export function pathLength(g: RouteGraph, path: number[]): number {
  return path.reduce((s, id) => s + g.edges[id].lengthM, 0);
}

/** Share of `alt`'s length that lies on segments `base` doesn't use. */
export function distinctShare(g: RouteGraph, base: number[], alt: number[]): number {
  const used = new Set(base.map((id) => segmentKey(g.edges[id])));
  const total = pathLength(g, alt);
  if (total <= 0) return 0;
  const distinct = alt.filter((id) => !used.has(segmentKey(g.edges[id]))).reduce((s, id) => s + g.edges[id].lengthM, 0);
  return distinct / total;
}

export function alternatePath(g: RouteGraph, from: number, to: number, shortest: number[]): number[] | null {
  if (shortest.length === 0) return null;
  const base = pathLength(g, shortest);
  const shared = new Set(shortest.map((id) => segmentKey(g.edges[id])));
  const seen = new Set<string>([shortest.join(",")]);
  for (const factor of [1.4, 2, 3, 5, 10]) {
    const candidate = shortestPath(g, from, to, (e) => (shared.has(segmentKey(e)) ? e.lengthM * factor : e.lengthM));
    if (!candidate) return null;
    const key = candidate.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const len = pathLength(g, candidate);
    if (len > base * ALT_MAX_STRETCH) return null; // heavier penalties only lengthen it
    if (distinctShare(g, shortest, candidate) >= ALT_MIN_DISTINCT_SHARE) return candidate;
  }
  return null;
}

export function walkingMinutes(lengthM: number): number {
  return Math.max(1, Math.ceil(lengthM / ((WALKING_SPEED_KMH * 1000) / 60)));
}

/** Concatenate edge geometries into one polyline (no duplicated joints). */
export function pathCoords(g: RouteGraph, path: number[]): LatLon[] {
  const out: LatLon[] = [];
  for (const id of path) {
    const c = g.edges[id].coords;
    out.push(...(out.length ? c.slice(1) : c));
  }
  return out;
}

export interface RouteStep {
  name: string | null;
  highway: string;
  lengthM: number;
}

/** Group consecutive edges by street name/type for a text description of the path. */
export function routeSteps(g: RouteGraph, path: number[]): RouteStep[] {
  const steps: RouteStep[] = [];
  for (const id of path) {
    const e = g.edges[id];
    const name = e.tags.name ?? null;
    const highway = e.tags.highway ?? "way";
    const last = steps[steps.length - 1];
    if (last && last.name === name && (name !== null || last.highway === highway)) last.lengthM += e.lengthM;
    else steps.push({ name, highway, lengthM: e.lengthM });
  }
  return steps;
}

export interface PlannedRoutes {
  ok: boolean;
  reason?: "not_near_walkway" | "no_connected_path" | "same_place";
  routes: Array<{ path: number[]; lengthM: number; minutes: number; label: "Shortest" | "Alternate" }>;
  snap?: { from: SnapCandidate; to: SnapCandidate };
}

export function planRoutes(g: RouteGraph, a: LatLon, b: LatLon): PlannedRoutes {
  const snap = snapPair(g, a, b);
  if (!snap.ok) return { ok: false, reason: snap.reason, routes: [] };
  if (snap.from.node === snap.to.node) return { ok: false, reason: "same_place", routes: [], snap };
  const shortest = shortestPath(g, snap.from.node, snap.to.node);
  if (!shortest || shortest.length === 0) return { ok: false, reason: "no_connected_path", routes: [], snap };
  const len = pathLength(g, shortest);
  const routes: PlannedRoutes["routes"] = [{ path: shortest, lengthM: len, minutes: walkingMinutes(len), label: "Shortest" }];
  const alt = alternatePath(g, snap.from.node, snap.to.node, shortest);
  if (alt) {
    const altLen = pathLength(g, alt);
    routes.push({ path: alt, lengthM: altLen, minutes: walkingMinutes(altLen), label: "Alternate" });
  }
  return { ok: true, routes, snap };
}
