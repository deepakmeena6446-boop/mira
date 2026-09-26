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
  const prepared = await prepareChecks(sql, getGeo(), now, { userId: user.id, limit: 2 }).then(() => true).catch(() => false);
  const [checks, impact] = await Promise.all([listChecks(sql, user.id, now), impactFor(sql, user, now)]);
  const url = new URL(req.url);
  const journeyId = url.searchParams.get("journeyId");
  let journeyCheck: "ready" | "pending" | "none" | "failed" | null = null;
  if (journeyId && /^[0-9a-f-]{36}$/i.test(journeyId)) {
    if (checks.some((c) => c.journeyId === journeyId)) journeyCheck = "ready";
    else {
      const [row] = await sql<{ state: string }[]>`SELECT state FROM mira_checks WHERE user_id = ${user.id} AND journey_id = ${journeyId} AND expires_at > ${now} LIMIT 1`;
      journeyCheck = row?.state === "preparing" ? "pending" : prepared ? "none" : "failed";
    }
  }
  return json({ checks, impact, durable: user.durable, journeyCheck });
});
