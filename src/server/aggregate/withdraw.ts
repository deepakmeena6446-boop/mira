import "server-only";
import type postgres from "postgres";
import type { Clock } from "@/server/clock";

/**
 * Called after a moderator withdraws an approved report. Filled in by the
 * aggregation module (Phase 5): suppresses any active release that would fall below
 * the independence threshold without this report.
 */
export async function onReportWithdrawn(sql: postgres.Sql, adminSessionId: string, reportId: string, clock: Clock): Promise<void> {
  void sql;
  void adminSessionId;
  void reportId;
  void clock;
}
