import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { requireUser } from "@/server/session/user";
import { answerCheck } from "@/server/contributions";

export const dynamic = "force-dynamic";

const body = z.object({ answer: z.enum(["open", "closed", "unsure", "skip"]), country: z.string().regex(/^[A-Z]{2}$/).nullable().optional() }).strict();

/** Answer (or skip) one MIRA Check. Objective answers only; "Didn't notice" records nothing. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/contribute/check/[id]">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) throw notFound();
  const sql = getSql();
  const user = await requireUser(sql);
  const now = new Date();
  await enforce(sql, [dailyKey("actor", user.id, now)], [{ bucket: "contrib:check:d", max: 20, windowMs: 86_400_000 }], now);
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "contrib:check:ip:h", max: 120, windowMs: 3600_000 }], now);
  const { answer, country } = await readJson(req, body, 256);
  const r = await answerCheck(sql, user, id, answer, now, country ?? null);
  return json({ ok: true, recorded: r.recorded, outcome: r.outcome });
});
