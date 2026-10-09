import { getSql } from "@/server/db/client";
import type { Metadata } from "next";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { currentTrip } from "@/server/trips";
import { smtpConfigured } from "@/server/config/env";
import { listSavedPlans } from "@/server/account/saved-plans";
import { HomeNow } from "./HomeNow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

/** Home (docs/phase1-ux/01). The previous Today and Go entries and their rollback flag were retired in Phase 3 (D40). */
export default async function Home() {
  const sql = getSql();
  const user = await getUser(sql);
  const [places, savedPlans, trip] = user ? await Promise.all([listPlaces(sql, user.id), listSavedPlans(sql, user.id).catch(() => []), currentTrip(sql, user.id, systemClock.now()).catch(() => null)]) : [[], [], null];
  const open = trip && (trip.state === "active" || trip.state === "missed") ? trip : null;
  return <HomeNow helpExclude={user?.helpExclude ?? []} user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null} places={places} savedPlan={savedPlans[0] ?? null} emailAlerts={smtpConfigured()} journeyTo={open ? (open.autoArrival ? open.destination.name : "") : null} />;
}
