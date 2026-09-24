import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ensureActor } from "@/server/session/actor";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { getMailer } from "@/server/mail";
import { workerStatus } from "@/server/health/worker";
import { createJourney, createJourneySchema } from "@/server/journey/service";
import { JOURNEY_CREATE_LIMITS, JOURNEY_GLOBAL_LIMITS, JOURNEY_IP_LIMITS } from "@/server/journey/http";

export const dynamic = "force-dynamic";

/** Start a temporary check-in journey for this browser. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], JOURNEY_IP_LIMITS, now);
  await enforce(sql, [dailyKey("global", "journeys", now)], JOURNEY_GLOBAL_LIMITS, now);
  const input = await readJson(req, createJourneySchema, 4096);
  const worker = await workerStatus(sql, systemClock);
  const actor = await ensureActor();
  await enforce(sql, [dailyKey("actor", actor.actorHash, now)], JOURNEY_CREATE_LIMITS, now);
  const journey = await createJourney({ sql, clock: systemClock, mailer: getMailer(), workerHealthy: worker.healthy }, actor.actorHash, input);
  console.log(JSON.stringify({ t: now.toISOString(), src: "web", event: "journey.created", journey: journey.id, contact: journey.contact }));
  return json({ journey }, 201);
});
