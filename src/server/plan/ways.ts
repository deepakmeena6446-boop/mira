import "server-only";
import type postgres from "postgres";
import type { GeoPoint, GeoProvider } from "@/server/providers/geo";
import { lightingEvidenceForRoutes } from "@/server/lighting";
import { helpPointsEvidenceForRoutes, withoutCorroboratedGone } from "@/server/help-points";

/** An alternative much longer than the fastest way isn't a real option for a walk. */
const ALT_MAX_STRETCH = 1.5;

/**
 * Up to three walking ways from `from` to `to`, each with the lighting mapped along it and the Help Points on it —
 * computed from the same data so they can be compared fairly. Shared by the Plan screen (/api/geo/route) and Mira
 * (check_plan), so she describes exactly what the screen shows. Deterministic; nothing here is a safety verdict.
 */
export async function walkWaysWithContext(sql: postgres.Sql, geo: GeoProvider, from: GeoPoint, to: GeoPoint) {
  const all = await geo.walkRoutes(from, to);
  const routes = all.filter((r, i) => i === 0 || (!r.approximate && r.minutes <= all[0].minutes * ALT_MAX_STRETCH)).slice(0, 3);
  // Only real street routes get lighting and Help Points: a straight-line estimate doesn't follow any street.
  const streets = routes.map((r) => (r.approximate ? [] : r.geometry));
  const [lighting, helpPoints] = await Promise.all([lightingEvidenceForRoutes(sql, streets), helpPointsEvidenceForRoutes(geo, streets)]);
  const help = await Promise.all(helpPoints.map(async (e) => {
    if (!("data" in e)) return e;
    const data = await withoutCorroboratedGone(sql, e.data);
    return { ...e, data, state: e.state === "ready" && !data.length ? "empty" as const : e.state };
  }));
  return { routes, lighting, help };
}
