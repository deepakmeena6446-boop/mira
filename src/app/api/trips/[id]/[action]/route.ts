import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { systemClock } from "@/server/clock";
import { requireUser } from "@/server/session/user";
import { extendJourney, userAction } from "@/server/journey/service";
import { tellMyPeopleNow, tripById, tripOwnerHash } from "@/server/trips";

export const dynamic = "force-dynamic";

/** Owner actions: /arrive, /end, /extend (+minutes), /checkon ("Tell my people now"). Reuses the journey state machine. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/trips/[id]/[action]">) => {
  assertSameOrigin(req);
  const { id, action } = await ctx.params;
  if (!z.guid().safeParse(id).success || !["arrive", "end", "extend", "checkon"].includes(action)) throw notFound();
  const sql = getSql();
  const user = await requireUser(sql);
  if (action === "checkon") {
    const r = await tellMyPeopleNow(sql, user, id, systemClock);
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
  return json({ trip: await tripById(sql, user.id, id, systemClock.now()) });
});
