import type { Metadata } from "next";
import { smtpConfigured } from "@/server/config/env";
import { countryRegistry } from "@/server/locale";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { PlanScreen } from "../PlanScreen";

export const metadata: Metadata = { title: "Return trip and legs" };

/** The step-based planner: return legs, multi-leg travel and saving a plan with its return. Phase 2 redesigns it. */
export default async function PlanLegsPage() {
  const user = await getUser(getSql());
  return <PlanScreen emailAlerts={smtpConfigured()} signedIn={Boolean(user)} countries={countryRegistry().map(({ iso2, name }) => ({ iso: iso2, name }))} />;
}
