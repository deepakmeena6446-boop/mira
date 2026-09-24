import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { systemClock } from "@/server/clock";
import { requireAdmin } from "@/server/admin/auth";
import { getReport, moderate } from "@/server/admin/reports";
import { CATEGORIES, REPORT_TIME_BANDS } from "@/domain/report/taxonomy";

export const dynamic = "force-dynamic";

const idSchema = z.guid();
const structured = z.object({ category: z.enum(CATEGORIES), tags: z.array(z.string().max(40)).max(8), timeBand: z.enum(REPORT_TIME_BANDS) }).strict();
const patchSchema = z
  .object({
    action: z.enum(["approve", "hold", "reject", "withdraw", "redact", "edit"]),
    reason: z.string().max(40).optional(),
    structured: structured.optional(),
  })
  .strict();

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/reports/[id]">) => {
  const sql = getSql();
  const admin = await requireAdmin(sql, systemClock);
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) throw notFound();
  const includeText = new URL(req.url).searchParams.get("text") === "1";
  return json({ report: await getReport(sql, id, { includeText, adminSessionId: admin.id }) });
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/reports/[id]">) => {
  assertSameOrigin(req);
  const sql = getSql();
  const admin = await requireAdmin(sql, systemClock);
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) throw notFound();
  const body = await readJson(req, patchSchema, 4096);
  const res = await moderate(sql, admin.id, id, body.action, { reason: body.reason, structured: body.structured }, systemClock);
  return json(res);
});
