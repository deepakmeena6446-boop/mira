import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { systemClock } from "@/server/clock";
import { requireUser } from "@/server/session/user";
import { extendJourney, userAction } from "@/server/journey/service";
import { changeTrip, tellMyPeopleNow, tripById, tripOwnerHash, shareTrip, revokeTripShare, createTripLink } from "@/server/trips";
import { MAX_CONTACTS } from "@/domain/limits";
import { dailyKey, enforce } from "@/server/ratelimit";
import { outcomeForTripClose, recordDecisionOutcomeBestEffort } from "@/server/decision-outcomes";

export const dynamic = "force-dynamic";

/** Owner actions reuse the journey record and its worker state. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/trips/[id]/[action]">) => {
  assertSameOrigin(req);
  const { id, action } = await ctx.params;
  if (!z.guid().safeParse(id).success || !["arrive", "end", "extend", "checkon", "change", "share", "revoke", "link"].includes(action)) throw notFound();
  const sql = getSql();
  const user = await requireUser(sql);
  if (["share", "link", "change"].includes(action)) {
    const now = systemClock.now();
    await enforce(sql, [dailyKey("actor", user.id, now)], [{ bucket: `trips:${action}:h`, max: action === "share" ? 20 : 60, windowMs: 3600_000 }], now);
  }
  if (action === "share") {
    const input = await readJson(req, z.object({ recipientIds: z.array(z.guid()).min(1).max(MAX_CONTACTS), idempotencyKey: z.guid().optional() }).strict(), 512);
    return json({ trip: await shareTrip(sql, user, id, input.recipientIds, systemClock, input.idempotencyKey) });
  }
  if (action === "revoke") {
    const input = await readJson(req, z.union([z.object({ contactId: z.guid() }).strict(), z.object({ ownerLink: z.literal(true) }).strict()]), 256);
    return json({ trip: await revokeTripShare(sql, user.id, id, input, systemClock) });
  }
  if (action === "link") {
    await readJson(req, z.object({}).strict(), 256);
    return json({ trip: await createTripLink(sql, user.id, id, systemClock) });
  }
  if (action === "change") {
    const input = await readJson(req, z.object({ to: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), name: z.string().trim().min(1).max(80) }).strict(), etaMinutes: z.number().int().min(5).max(235), idempotencyKey: z.guid().optional() }).strict(), 512);
    const trip = await changeTrip(sql, user.id, id, input, systemClock);
    await recordDecisionOutcomeBestEffort(sql, "journey_changed", systemClock.now());
    console.log(JSON.stringify({ t: systemClock.now().toISOString(), src: "web", event: "trip.changed", trip: id, by: "user" }));
    return json({ trip });
  }
  if (action === "checkon") {
    const input = await readJson(req, z.object({ recipientIds: z.array(z.guid()).max(MAX_CONTACTS).optional(), idempotencyKey: z.guid().optional() }).strict(), 512);
    const r = await tellMyPeopleNow(sql, user, id, systemClock, input);
    return json({ ...r, trip: await tripById(sql, user.id, id, systemClock.now()) });
  }
  const owner = tripOwnerHash(user.id);
  if (action === "extend") {
    const { minutes } = await readJson(req, z.object({ minutes: z.number().int().min(5).max(60) }).strict(), 256);
    const cur = await tripById(sql, user.id, id, systemClock.now());
    const base = Math.max(new Date(cur.etaAt).getTime(), systemClock.now().getTime());
    await extendJourney(sql, owner, id, new Date(base + minutes * 60_000).toISOString(), systemClock);
  } else {
    await userAction(sql, owner, id, action === "arrive" ? "arrive" : "end", systemClock);
  }
  console.log(JSON.stringify({ t: systemClock.now().toISOString(), src: "web", event: `trip.${action === "arrive" ? "arrived" : action === "end" ? "ended" : "extended"}`, trip: id, by: "user" }));
  if (action === "arrive" || action === "end") await recordDecisionOutcomeBestEffort(sql, outcomeForTripClose(action), systemClock.now());
  return json({ trip: await tripById(sql, user.id, id, systemClock.now()) });
});
