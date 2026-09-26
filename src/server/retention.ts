import type postgres from "postgres";
import { purgeExpiredCounters } from "@/server/ratelimit";
import { purgeOldReleases } from "@/server/aggregate/run";
import { deleteAccount } from "@/server/account/users";
import { purgeOldLitVotes } from "@/server/lighting";
import { encryptLegacyPlaces } from "@/server/account/places";
import { purgeAuthLinks } from "@/server/account/email-auth";
import { purgeStaleHabits } from "@/server/account/habits";
import { purgeContributions } from "@/server/contributions/retention";

/** Durable (email) accounts unused for this long are deleted, with everything tied to them. */
export const INACTIVE_ACCOUNT_DAYS = 400;

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
    WHERE u.created_at < ${new Date(now.getTime() - 3600_000)} AND u.email_hash IS NULL
      AND NOT EXISTS (SELECT 1 FROM user_sessions s WHERE s.user_id = u.id AND s.expires_at > ${now})
    LIMIT 100`;
  for (const o of orphans) await deleteAccount(sql, o.id);
  // Durable accounts can be signed back into, so they stay — until unused for over a year.
  const inactive = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email_hash IS NOT NULL AND last_active_at < ${new Date(now.getTime() - INACTIVE_ACCOUNT_DAYS * 86_400_000)} LIMIT 100`;
  for (const u of inactive) await deleteAccount(sql, u.id);
  const authLinks = await purgeAuthLinks(sql, now);
  const placesEncrypted = await encryptLegacyPlaces(sql);
  const litVotes = await purgeOldLitVotes(sql, now);
  // Journey habits unused for over 400 days (she can also forget them any time in Me).
  const habits = await purgeStaleHabits(sql, now);
  // ── Contributions (Contribute tab / MIRA Checks; docs/CONTRIBUTIONS.md) ─────────────
  const contributions = await purgeContributions(sql, now);
  // ── end Contributions ───────────────────────────────────────────────────────────────
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
    inactiveAccounts: inactive.length,
    authLinks,
    placesEncrypted,
    litVotes,
    habits,
    ...contributions,
  };
}
