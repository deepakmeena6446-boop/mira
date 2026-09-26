import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trips" };

/** TRIPS tab (Day-0 track D fills this in): the active journey first. */
export default async function TripsPage() {
  redirect("/trip");
}
