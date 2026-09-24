import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getCapabilities } from "@/server/capabilities";
import { getActor } from "@/server/session/actor";
import { currentJourney } from "@/server/journey/service";
import { systemClock } from "@/server/clock";
import { AccompanyClient } from "./AccompanyClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Make sure I reach" };

export default async function AccompanyPage() {
  const caps = await getCapabilities();
  const actor = caps.database ? await getActor() : null;
  const journey = actor ? await currentJourney(getSql(), actor.actorHash, systemClock.now()) : null;
  return <AccompanyClient initial={journey} journeysAvailable={caps.journeys} contactAvailable={caps.contactEmail} />;
}
