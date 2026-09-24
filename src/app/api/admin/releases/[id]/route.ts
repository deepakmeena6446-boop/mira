import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { systemClock } from "@/server/clock";
import { requireAdmin } from "@/server/admin/auth";
import { suppressRelease } from "@/server/aggregate/run";
import { WITHDRAW_REASONS } from "@/domain/moderation";

export const dynamic = "force-dynamic";

/** Emergency removal of a public summary. */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/releases/[id]">) => {
  assertSameOrigin(req);
  const sql = getSql();
  const admin = await requireAdmin(sql, systemClock);
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) throw notFound();
  const body = await readJson(req, z.object({ action: z.literal("suppress"), reason: z.enum(WITHDRAW_REASONS) }).strict(), 1024);
  const changed = await suppressRelease(sql, id, body.reason, admin.id, systemClock.now());
  return json({ suppressed: true, changed });
});
