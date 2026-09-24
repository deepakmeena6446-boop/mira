import "server-only";
import type postgres from "postgres";
import type { Clock } from "@/server/clock";
import { recheckReleasesForReport } from "./run";

/**
 * After a moderator withdraws an approved report: it is already excluded from future
 * runs; additionally suppress any active release that now falls below the threshold.
 */
export async function onReportWithdrawn(sql: postgres.Sql, adminSessionId: string, reportId: string, clock: Clock): Promise<void> {
  const now = clock.now();
  const ids = await recheckReleasesForReport(sql, reportId, now);
  for (const id of ids) {
    await sql`INSERT INTO admin_audit (admin_session_id, action, release_id, reason_code, created_at)
              VALUES (${adminSessionId}, 'suppress_release', ${id}, 'contributor_withdrawn', ${now})`;
  }
}
