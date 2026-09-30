import { getSql } from "@/server/db/client";
import type { Metadata } from "next";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { currentTrip } from "@/server/trips";
import { smtpConfigured } from "@/server/config/env";
import { TodayScreen } from "./TodayScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

export default async function Today() {
  const sql = getSql();
  const user = await getUser(sql);
  const [places, trip] = user
    ? await Promise.all([listPlaces(sql, user.id), currentTrip(sql, user.id, systemClock.now())])
    : [[], null];
  return (
    <TodayScreen name={user?.name ?? null} places={places} trip={trip} emailAlerts={smtpConfigured()} />
  );
}
