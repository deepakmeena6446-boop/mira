import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { sharedTrip } from "@/server/trips";
import { tileConfig } from "@/server/providers/geo/tiles";
import { SharedTripView } from "./SharedTripView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live trip", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharedTripPage({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  const trip = await sharedTrip(getSql(), token, systemClock.now());
  if (!trip) notFound();
  return <SharedTripView token={token} initial={trip} tiles={tileConfig()} />;
}
