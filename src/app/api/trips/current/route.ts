import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { currentTrip } from "@/server/trips";
import { safetyNet } from "@/server/health/safety-net";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  const user = await getUser(sql);
  if (!user) return json({ trip: null });
  const [trip, net] = await Promise.all([currentTrip(sql, user.id, systemClock.now()), safetyNet(sql, systemClock)]);
  return json({ trip, safetyNet: net });
});
