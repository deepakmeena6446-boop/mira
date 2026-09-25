import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { requireUser } from "@/server/session/user";
import { startTrip, startTripSchema } from "@/server/trips";
import { workerStatus } from "@/server/health/worker";
import { unavailable } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const now = systemClock.now();
  await enforce(sql, [dailyKey("actor", user.id, now), dailyKey("ip", clientIp(req), now)], [{ bucket: "trips:start:h", max: 12, windowMs: 3600_000 }], now);
  if (!(await workerStatus(sql, systemClock)).healthy) throw unavailable("trips_unavailable", "Trip sharing is paused for a moment. Please try again shortly.");
  const input = await readJson(req, startTripSchema, 1024);
  const trip = await startTrip(sql, user, input, systemClock);
  console.log(JSON.stringify({ t: now.toISOString(), src: "web", event: "trip.started", trip: trip.id, contacts: trip.sharedWith.length }));
  return json({ trip }, 201);
});
