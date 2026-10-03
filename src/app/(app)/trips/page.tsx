import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { smtpConfigured } from "@/server/config/env";
import { tripsOverview } from "@/server/trips";
import { JourneysScreen } from "./JourneysScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journeys" };

/** Journeys root (docs/phase2-ux/00 §1). Journeys are read here; the screen is client-side for the live clock. */
export default async function TripsPage() {
  const sql = getSql();
  const user = await getUser(sql);
  const data = user ? await tripsOverview(sql, user.id, systemClock.now()) : null;
  return <JourneysScreen signedIn={Boolean(user)} emailAlerts={smtpConfigured()} active={data?.active ?? null} recent={data?.recent ?? []} />;
}
