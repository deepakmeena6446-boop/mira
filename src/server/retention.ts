import type postgres from "postgres";
import { purgeExpiredCounters } from "@/server/ratelimit";

/**
 * Hard-delete expired private data (architecture §3). Runs in the worker.
 * report_structured rows cascade with their report.
 */
export async function purgeExpired(sql: postgres.Sql, now: Date): Promise<Record<string, number>> {
  const reports = await sql`DELETE FROM reports_private WHERE expires_at <= ${now}`;
  const actors = await sql`DELETE FROM actor_sessions WHERE expires_at <= ${now}`;
  const admins = await sql`DELETE FROM admin_sessions WHERE expires_at < ${new Date(now.getTime() - 24 * 3600_000)}`;
  const audit = await sql`DELETE FROM admin_audit WHERE created_at < ${new Date(now.getTime() - 90 * 86_400_000)}`;
  const counters = await purgeExpiredCounters(sql, now);
  return { reports: reports.count, actorSessions: actors.count, adminSessions: admins.count, audit: audit.count, counters };
}
