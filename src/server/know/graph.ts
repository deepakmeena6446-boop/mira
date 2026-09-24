import "server-only";
import type postgres from "postgres";
import { buildRouteGraph, type RouteGraph } from "@/domain/routing";

/**
 * In-process cache of the public walking graph. Reloaded when a new snapshot is
 * imported (checked at most once a minute). Contains no user data.
 */
interface Cached {
  key: string;
  graph: RouteGraph;
  checkedAt: number;
}
const g = globalThis as unknown as { __miraGraph?: Cached };

export async function loadGraph(sql: postgres.Sql): Promise<RouteGraph | null> {
  const now = Date.now();
  if (g.__miraGraph && now - g.__miraGraph.checkedAt < 60_000) return g.__miraGraph.graph;
  const [pilot] = await sql<{ id: string; imported_at: Date }[]>`
    SELECT id, imported_at FROM pilot_areas WHERE status = 'ready' ORDER BY imported_at DESC LIMIT 1`;
  if (!pilot) {
    g.__miraGraph = undefined;
    return null;
  }
  const key = `${pilot.id}@${new Date(pilot.imported_at).getTime()}`;
  if (g.__miraGraph?.key === key) {
    g.__miraGraph.checkedAt = now;
    return g.__miraGraph.graph;
  }
  const nodes = await sql<{ id: number; lat: number; lon: number; component: number }[]>`
    SELECT osm_node_id AS id, ST_Y(point) AS lat, ST_X(point) AS lon, component FROM walk_nodes WHERE pilot_id = ${pilot.id}`;
  const edges = await sql<{ from: number; to: number; length_m: number; way_id: number; coords: Array<[number, number]>; tags: Record<string, string> }[]>`
    SELECT from_node AS from, to_node AS to, length_m, source_way_id AS way_id,
           (ST_AsGeoJSON(geom)::json -> 'coordinates') AS coords, tags
    FROM walk_edges WHERE pilot_id = ${pilot.id} ORDER BY id`;
  const graph = buildRouteGraph(
    nodes.map((n) => ({ id: Number(n.id), lat: n.lat, lon: n.lon, component: n.component })),
    edges.map((e) => ({
      from: Number(e.from),
      to: Number(e.to),
      lengthM: e.length_m,
      wayId: Number(e.way_id),
      coords: e.coords.map(([lon, lat]) => ({ lat, lon })),
      tags: e.tags,
    })),
  );
  g.__miraGraph = { key, graph, checkedAt: now };
  return graph;
}
