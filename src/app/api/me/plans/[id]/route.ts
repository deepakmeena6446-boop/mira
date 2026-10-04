import { z } from "zod";
import { getSql } from "@/server/db/client";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { handle, json, readJson } from "@/server/http/handler";
import { planDraftSchema } from "@/domain/plan-state";
import { requireUser } from "@/server/session/user";
import { deleteSavedPlan, updateSavedPlan } from "@/server/account/saved-plans";

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

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/me/plans/[id]">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) throw notFound();
  const sql = getSql();
  const user = await requireUser(sql);
  const { draft } = await readJson(req, z.object({ draft: planDraftSchema }).strict(), 16_384);
  const plan = await updateSavedPlan(sql, user.id, id, draft);
  if (!plan) throw notFound();
  return json({ plan });
});
