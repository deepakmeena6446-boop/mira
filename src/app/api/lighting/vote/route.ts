import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { requireUser } from "@/server/session/user";
import { recordLitVote } from "@/server/lighting";

export const dynamic = "force-dynamic";

const coord = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const body = z.object({ route: z.array(coord).min(2).max(2000), vote: z.enum(["lit", "partly", "dark"]) }).strict();

/** "Was the way lit?" after a trip. The route is reduced to anonymous street cells and discarded. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const now = new Date();
  await enforce(sql, [dailyKey("actor", user.id, now)], [{ bucket: "lit:vote:d", max: 10, windowMs: 86_400_000 }], now);
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "lit:vote:ip:h", max: 200, windowMs: 3600_000 }], now);
  const { route, vote } = await readJson(req, body, 64 * 1024);
  const cells = await recordLitVote(sql, user.id, route, vote, now);
  return json({ ok: true, cells });
});
