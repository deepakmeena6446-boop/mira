import { z } from "zod";
import { getSql } from "@/server/db/client";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { handle, json } from "@/server/http/handler";
import { requireUser } from "@/server/session/user";
import { deleteSavedPlan } from "@/server/account/saved-plans";

export const dynamic = "force-dynamic";
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/me/plans/[id]">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) throw notFound();
  const sql = getSql();
  const user = await requireUser(sql);
  if (!await deleteSavedPlan(sql, user.id, id)) throw notFound();
  return json({ deleted: true });
});
