import type { Metadata } from "next";
import { smtpConfigured } from "@/server/config/env";
import { countryRegistry } from "@/server/locale";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { PlanScreen } from "./PlanScreen";

export const metadata: Metadata = { title: "Plan a movement" };

export default async function PlanPage() {
  const user = await getUser(getSql());
  return <PlanScreen emailAlerts={smtpConfigured()} signedIn={Boolean(user)} countries={countryRegistry().map(({ iso2, name }) => ({ iso: iso2, name }))} />;
}
