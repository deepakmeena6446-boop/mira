import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { requireUser } from "@/server/session/user";
import { addLocation } from "@/server/trips";

export const dynamic = "force-dynamic";

const body = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), accuracy: z.number().min(0).max(10_000).optional() }).strict();

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/trips/[id]/location">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) throw notFound();
  const sql = getSql();
  const user = await requireUser(sql);
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "trips:loc:m", max: 30, windowMs: 60_000 }], now);
  return json(await addLocation(sql, user.id, id, await readJson(req, body, 256), systemClock));
});
