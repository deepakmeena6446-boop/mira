import { z } from "zod";
import { planDraftSchema } from "@/domain/plan-state";
import { getSql } from "@/server/db/client";
import { assertSameOrigin } from "@/server/http/csrf";
import { handle, json, readJson } from "@/server/http/handler";
import { requireUser } from "@/server/session/user";
import { listSavedPlans, savePlan } from "@/server/account/saved-plans";

export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  return json({ plans: await listSavedPlans(sql, user.id) });
});
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const { draft } = await readJson(req, z.object({ draft: planDraftSchema }).strict(), 16_384);
  return json({ plan: await savePlan(sql, user.id, draft) }, 201);
});
