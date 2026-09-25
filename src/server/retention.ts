import type postgres from "postgres";
import { purgeExpiredCounters } from "@/server/ratelimit";
import { purgeOldReleases } from "@/server/aggregate/run";
import { deleteAccount } from "@/server/account/users";
import { purgeOldLitVotes } from "@/server/lighting";

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
  const releases = await purgeOldReleases(sql, now);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const chat = await sql`DELETE FROM mira_messages WHERE created_at < ${monthAgo}`;
  const inbox = await sql`DELETE FROM notifications WHERE created_at < ${monthAgo}`;
  const userSessions = await sql`DELETE FROM user_sessions WHERE expires_at <= ${now}`;
  // Demo accounts can't be signed back into once their session is gone, so they'd be
  // orphaned forever (with contacts' encrypted emails). Remove them the same way as a delete.
  const orphans = await sql<{ id: string }[]>`
    SELECT u.id FROM users u JOIN auth_accounts a ON a.user_id = u.id AND a.provider = 'demo'
    WHERE u.created_at < ${new Date(now.getTime() - 3600_000)}
      AND NOT EXISTS (SELECT 1 FROM user_sessions s WHERE s.user_id = u.id AND s.expires_at > ${now})
    LIMIT 100`;
  for (const o of orphans) await deleteAccount(sql, o.id);
  const litVotes = await purgeOldLitVotes(sql, now);
  return {
    reports: reports.count,
    actorSessions: actors.count,
    adminSessions: admins.count,
    audit: audit.count,
    counters,
    releases,
    miraMessages: chat.count,
    notifications: inbox.count,
    userSessions: userSessions.count,
    orphanedDemoAccounts: orphans.length,
    litVotes,
  };
}
