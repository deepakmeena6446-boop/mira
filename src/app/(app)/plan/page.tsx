import type { Metadata } from "next";
import { smtpConfigured } from "@/server/config/env";
import { countryRegistry } from "@/server/locale";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { getPrefs } from "@/server/account/habits";
import { tileConfig } from "@/server/providers/geo/tiles";
import { PlanScreen } from "./PlanScreen";
import { PlanDecision, type Situation } from "./PlanDecision";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plan" };

const SITUATIONS: Situation[] = ["go", "run", "travel"];

/**
 * The decision flow (docs/phase1-ux/01 §3). `?for=go|run|travel` picks the situation. Links into the
 * previous step-based planner (`?planStep=…`, used by journey return-leg links) still open it; it also
 * lives at /plan/legs for return trips and multi-leg plans.
 */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ for?: string; planStep?: string }> }) {
  const sql = getSql();
  const [params, user] = await Promise.all([searchParams, getUser(sql)]);
  if (params.planStep) return <PlanScreen emailAlerts={smtpConfigured()} signedIn={Boolean(user)} countries={countryRegistry().map(({ iso2, name }) => ({ iso: iso2, name }))} />;
  const [places, tiles, prefs] = await Promise.all([user ? listPlaces(sql, user.id) : Promise.resolve([]), tileConfig(), user ? getPrefs(sql, user.id).catch(() => null) : Promise.resolve(null)]);
  const initialFor = SITUATIONS.includes(params.for as Situation) ? (params.for as Situation) : null;
  // Her explicit settings only: a remembered travel mode is a default for a new plan; excluded Help Point kinds stay out.
  return <PlanDecision signedIn={Boolean(user)} emailAlerts={smtpConfigured()} places={places} tiles={tiles} initialFor={initialFor} preferredMode={prefs?.prefs.mode ?? null} helpExclude={user?.helpExclude ?? []} />;
}
