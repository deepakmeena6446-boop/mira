import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { notFound } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { sharedTrip } from "@/server/trips";

export const dynamic = "force-dynamic";

/** Live data for a contact holding the share link. Nothing once the trip ends. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/t/[token]">) => {
  const { token } = await ctx.params;
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "share:view:m", max: 60, windowMs: 60_000 }], now);
  const data = await sharedTrip(sql, token, now);
  if (!data) throw notFound("This trip link isn't valid.");
  return json(data, 200, { "referrer-policy": "no-referrer" });
});
