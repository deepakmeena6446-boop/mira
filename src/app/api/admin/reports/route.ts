import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { systemClock } from "@/server/clock";
import { requireAdmin } from "@/server/admin/auth";
import { countByStatus, listReports } from "@/server/admin/reports";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["pending", "held", "approved", "rejected"]);

export const GET = handle(async (req: Request) => {
  const sql = getSql();
  await requireAdmin(sql, systemClock);
  const parsed = statusSchema.safeParse(new URL(req.url).searchParams.get("status") ?? "pending");
  if (!parsed.success) throw badRequest("invalid_status", "Unknown status filter.");
  const [reports, counts] = await Promise.all([listReports(sql, parsed.data), countByStatus(sql)]);
  return json({ reports, counts });
});
