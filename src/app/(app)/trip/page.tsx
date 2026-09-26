import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { currentTrip } from "@/server/trips";
import { safetyNet } from "@/server/health/safety-net";
import { tileConfig } from "@/server/providers/geo/tiles";
import { listContacts } from "@/server/account/contacts";
import { smtpConfigured } from "@/server/config/env";
import { TripScreen } from "./TripScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your journey" };

export default async function TripPage() {
  const sql = getSql();
  const user = await getUser(sql);
  if (!user) redirect("/trips");
  const trip = await currentTrip(sql, user.id, systemClock.now());
  if (!trip) redirect("/trips"); // no journey: the Trips tab explains and offers "Where are you going?"
  const contacts = await listContacts(sql, user.id);
  const canTell = smtpConfigured() && contacts.some((c) => c.status === "accepted" && c.isDefault);
  return <TripScreen initial={trip} initialNet={await safetyNet(sql, systemClock)} tiles={await tileConfig()} helpExclude={user.helpExclude} canTell={canTell} emailAlerts={smtpConfigured()} />;
}
