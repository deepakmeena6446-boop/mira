import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { getActor } from "@/server/session/actor";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { extendJourney, revokeContact, userAction } from "@/server/journey/service";
import { JOURNEY_IP_LIMITS } from "@/server/journey/http";

export const dynamic = "force-dynamic";

const ACTIONS = ["arrive", "end", "extend", "revoke-contact"] as const;

/** Owner-only atomic transitions: /arrive, /end, /extend, /revoke-contact. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/journeys/[id]/[action]">) => {
  assertSameOrigin(req);
  const { id, action } = await ctx.params;
  if (!z.guid().safeParse(id).success || !(ACTIONS as readonly string[]).includes(action)) throw notFound();
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], JOURNEY_IP_LIMITS, now);
  const actor = await getActor();
  if (!actor) throw notFound("Journey not found.");
  let journey;
  if (action === "extend") {
    const { etaAt } = await readJson(req, z.object({ etaAt: z.iso.datetime({ offset: true }) }).strict(), 1024);
    journey = await extendJourney(sql, actor.actorHash, id, etaAt, systemClock);
  } else if (action === "revoke-contact") {
    journey = await revokeContact(sql, actor.actorHash, id, systemClock);
  } else {
    journey = await userAction(sql, actor.actorHash, id, action === "arrive" ? "arrive" : "end", systemClock);
  }
  console.log(JSON.stringify({ t: now.toISOString(), src: "web", event: `journey.${action}`, journey: id, state: journey.state }));
  return json({ journey });
});
