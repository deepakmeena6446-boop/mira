import { getSql } from "@/server/db/client";
import type { Metadata } from "next";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { currentTrip } from "@/server/trips";
import { smtpConfigured } from "@/server/config/env";
import { listSavedPlans } from "@/server/account/saved-plans";
import { GoScreen } from "./GoScreen";
import { TodayScreen } from "./TodayScreen";
import { countryRegistry } from "@/server/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Go" };

export default async function Go() {
  const sql = getSql();
  const user = await getUser(sql);
  if (process.env.NEXT_PUBLIC_MIRA_GO_ENTRY === "legacy") {
    const [places, trip] = user ? await Promise.all([listPlaces(sql, user.id), currentTrip(sql, user.id, systemClock.now())]) : [[], null];
    return <TodayScreen name={user?.name ?? null} places={places} trip={trip} emailAlerts={smtpConfigured()} />;
  }
  const [trip, savedPlans] = user ? await Promise.all([currentTrip(sql, user.id, systemClock.now()), listSavedPlans(sql, user.id)]) : [null, []];
  return (
    <GoScreen name={user?.name ?? null} trip={trip} savedPlan={savedPlans[0] ?? null} emailAlerts={smtpConfigured()} countries={countryRegistry().map(({ iso2, name }) => ({ iso: iso2, name }))} />
  );
}
