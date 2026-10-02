import "server-only";
import type postgres from "postgres";
import type { LatLon } from "@/domain/pilot";
import type { MovementIntent } from "@/domain/plan-contract";
import { planRoutes } from "@/domain/routing";
import { resolvePlanOptions, type PlanOptionsResult } from "@/domain/plan-options";
import { loadGraph } from "@/server/know/graph";

/** One request-scoped planned comparison. No user plan, route trace or question is persisted. */
export async function planOptionsFor(sql: postgres.Sql, from: LatLon, to: LatLon, departure: MovementIntent["departure"], checkedAt = new Date()): Promise<PlanOptionsResult> {
  try {
    const graph = await loadGraph(sql);
    const [snapshot] = await sql<{ source_date: Date }[]>`SELECT source_date FROM pilot_areas WHERE status = 'ready' ORDER BY imported_at DESC LIMIT 1`;
    const sourceAt = snapshot ? new Date(snapshot.source_date) : null;
    return resolvePlanOptions({ graph, routes: graph ? planRoutes(graph, from, to) : null, sourceAt, checkedAt, from, to, local: departure.local, timeZone: departure.timeZone });
  } catch {
    return resolvePlanOptions({ graph: null, routes: null, sourceAt: null, checkedAt, from, to, local: departure.local, timeZone: departure.timeZone, failed: true });
  }
}
