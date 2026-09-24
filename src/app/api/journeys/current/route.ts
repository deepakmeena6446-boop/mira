import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { getActor } from "@/server/session/actor";
import { systemClock } from "@/server/clock";
import { currentJourney } from "@/server/journey/service";

export const dynamic = "force-dynamic";

/** This browser's current journey. A missing cookie cannot retrieve any journey. */
export const GET = handle(async () => {
  const actor = await getActor();
  if (!actor) return json({ journey: null });
  return json({ journey: await currentJourney(getSql(), actor.actorHash, systemClock.now()) });
});
