import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { systemClock } from "@/server/clock";
import { requireAdmin } from "@/server/admin/auth";
import { listActiveReleases } from "@/server/admin/releases";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  await requireAdmin(sql, systemClock);
  return json({ releases: await listActiveReleases(sql, systemClock.now()) });
});
