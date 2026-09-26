import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { dailyKey, enforce } from "@/server/ratelimit";
import { requireUser } from "@/server/session/user";
import { getGeo } from "@/server/providers/geo";
import { impactFor, listChecks, prepareChecks } from "@/server/contributions";

export const dynamic = "force-dynamic";

/**
 * Her Contribute tab: MIRA Checks from her recent walks, her verified impact and Local Steward
 * status. Private to her; nothing here is about anyone else.
 */
export const GET = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const now = new Date();
  await enforce(sql, [dailyKey("actor", user.id, now)], [{ bucket: "contrib:get:m", max: 30, windowMs: 60_000 }], now);
  // A walk that just ended may still be "preparing": finish hers now (bounded) rather than wait for the worker.
  await prepareChecks(sql, getGeo(), now, { userId: user.id, limit: 2 }).catch(() => undefined);
  const [checks, impact] = await Promise.all([listChecks(sql, user.id, now), impactFor(sql, user, now)]);
  return json({ checks, impact, durable: user.durable });
});
