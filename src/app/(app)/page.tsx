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
import { HomeNow } from "./HomeNow";
import { countryRegistry } from "@/server/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

/**
 * Home (docs/phase1-ux/01). Rollback: NEXT_PUBLIC_MIRA_GO_ENTRY=go restores the previous Go entry,
 * =legacy the five-tab Today.
 */
export default async function Home() {
  const sql = getSql();
  const user = await getUser(sql);
  const entry = process.env.NEXT_PUBLIC_MIRA_GO_ENTRY;
  if (entry === "legacy") {
    const [places, trip] = user ? await Promise.all([listPlaces(sql, user.id), currentTrip(sql, user.id, systemClock.now())]) : [[], null];
    return <TodayScreen name={user?.name ?? null} places={places} trip={trip} emailAlerts={smtpConfigured()} />;
  }
  if (entry === "go") {
    const [trip, savedPlans] = user ? await Promise.all([currentTrip(sql, user.id, systemClock.now()), listSavedPlans(sql, user.id)]) : [null, []];
    return <GoScreen name={user?.name ?? null} trip={trip} savedPlan={savedPlans[0] ?? null} emailAlerts={smtpConfigured()} countries={countryRegistry().map(({ iso2, name }) => ({ iso: iso2, name }))} />;
  }
  const [places, savedPlans, trip] = user ? await Promise.all([listPlaces(sql, user.id), listSavedPlans(sql, user.id).catch(() => []), currentTrip(sql, user.id, systemClock.now()).catch(() => null)]) : [[], [], null];
  const open = trip && (trip.state === "active" || trip.state === "missed") ? trip : null;
  return <HomeNow user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null} places={places} savedPlan={savedPlans[0] ?? null} emailAlerts={smtpConfigured()} journeyTo={open ? (open.autoArrival ? open.destination.name : "") : null} />;
}
