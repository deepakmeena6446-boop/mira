import "server-only";
import type postgres from "postgres";
import type { LatLon } from "@/domain/pilot";
import type { MovementIntent } from "@/domain/plan-contract";
import { pathCoords, planPedestrianLoops, planRoutes } from "@/domain/routing";
import { LIGHTING_REQUIREMENT, loopTargetMeters, resolvePlanOptions, type PlanOptionsResult } from "@/domain/plan-options";
import { lightingEvidenceForRoutes } from "@/server/lighting";
import { resolvedDestination, resolvedOrigin } from "@/domain/plan-state";
import { badRequest } from "@/server/http/errors";
import { loadGraph } from "@/server/know/graph";

/** Per route, the share mapped as lit or with street lamps (null: nothing mapped); "failed" when no lighting source answered. */
async function litShares(sql: postgres.Sql, geometries: Array<Array<[number, number]>>): Promise<Array<number | null> | "failed"> {
  try {
    const evidence = await lightingEvidenceForRoutes(sql, geometries);
    if (evidence.every((e) => e.state === "failed")) return "failed";
    return evidence.map((e) => (e.state === "ready" || e.state === "partial" ? e.data.summary.lit + e.data.summary.poles : null));
  } catch {
    return "failed";
  }
}

/** One request-scoped planned comparison. No user plan, route trace or question is persisted. */
export async function planOptionsFor(sql: postgres.Sql, from: LatLon, to: LatLon, departure: MovementIntent["departure"], checkedAt = new Date(), intent?: MovementIntent): Promise<PlanOptionsResult> {
  if (intent && intent.mode !== "walk") return resolvePlanOptions({ graph: null, routes: null, sourceAt: null, checkedAt, from, to, local: departure.local, timeZone: departure.timeZone, intent });
  try {
    const graph = await loadGraph(sql);
    const [snapshot] = await sql<{ source_date: Date }[]>`SELECT source_date FROM pilot_areas WHERE status = 'ready' ORDER BY imported_at DESC LIMIT 1`;
    const sourceAt = snapshot ? new Date(snapshot.source_date) : null;
    const routes = graph ? intent?.loop && intent.mode === "walk" ? planPedestrianLoops(graph, from, loopTargetMeters(intent)) : intent?.loop ? null : planRoutes(graph, from, to) : null;
    // She asked for lit ways: answer from the lighting mapped along each one (the same engine as the Plan screen).
    const wantsLighting = Boolean(intent?.constraints.some((c) => LIGHTING_REQUIREMENT.test(c)));
    const lighting = wantsLighting && graph && routes?.ok && routes.routes.length
      ? await litShares(sql, routes.routes.map((r) => pathCoords(graph, r.path).map((p): [number, number] => [p.lon, p.lat])))
      : undefined;
    return resolvePlanOptions({ graph, routes, sourceAt, checkedAt, from, to, local: departure.local, timeZone: departure.timeZone, intent, lighting });
  } catch {
    return resolvePlanOptions({ graph: null, routes: null, sourceAt: null, checkedAt, from, to, local: departure.local, timeZone: departure.timeZone, failed: true, intent });
  }
}

export function planOptionsForIntent(sql: postgres.Sql, intent: MovementIntent, checkedAt = new Date()): Promise<PlanOptionsResult> {
  const from = resolvedOrigin(intent);
  const to = intent.loop ? from : resolvedDestination(intent);
  if (!from || !to) throw badRequest("unresolved_places", "Choose the named starting place and destination before comparing mapped options.");
  return planOptionsFor(sql, from, to, intent.departure, checkedAt, intent);
}
