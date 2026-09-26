import "server-only";
import type postgres from "postgres";
import { hmacHex, randomToken } from "@/server/crypto";

export async function createDemoUser(sql: postgres.Sql, name: string): Promise<string> {
  return sql.begin(async (tx) => {
    const [u] = await tx<{ id: string }[]>`INSERT INTO users (name) VALUES (${name}) RETURNING id`;
    await tx`INSERT INTO auth_accounts (provider, provider_user_id, user_id) VALUES ('demo', ${randomToken(12)}, ${u.id})`;
    return u.id;
  });
}

/**
 * On sign-in, reports this browser sent anonymously become the account's own: re-keyed
 * to the account pseudonym (so one person never counts as two independent contributors)
 * and unlinked again if the account is deleted. Reports stay private and anonymous to everyone else.
 * Returns how many were claimed.
 */
export async function claimAnonymousReports(sql: postgres.Sql, userId: string, anonActorHash: string): Promise<number> {
  const userActor = hmacHex("user-actor", userId);
  return sql.begin(async (tx) => {
    const claimed = await tx<{ id: string }[]>`
      UPDATE reports_private r SET user_id = ${userId}, actor_hash = ${userActor}
      WHERE r.actor_hash = ${anonActorHash} AND r.user_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM reports_private x WHERE x.actor_hash = ${userActor} AND x.idempotency_key = r.idempotency_key)
      RETURNING r.id`;
    if (claimed.length) {
      // Keep release history consistent so the "new contributors" rule still sees one person.
      await tx`UPDATE aggregate_contributions SET actor_hash = ${userActor} WHERE report_id = ANY(${claimed.map((c) => c.id)})`;
    }
    return claimed.length;
  });
}

export async function updateProfile(sql: postgres.Sql, userId: string, patch: { name?: string; onboarded?: boolean; helpExclude?: string[] }): Promise<void> {
  if (patch.name) await sql`UPDATE users SET name = ${patch.name} WHERE id = ${userId}`;
  if (patch.helpExclude) await sql`UPDATE users SET help_exclude = ${patch.helpExclude} WHERE id = ${userId}`;
  if (patch.onboarded) await sql`UPDATE users SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = ${userId}`;
}

/**
 * Deletes the account and everything tied to it (places, contacts, trips, chat, inbox).
 * Reports are community data, so they stay (anonymous, and still deleted on their own
 * ≤30-day schedule) — but first they're re-keyed to a random pseudonym, so nothing left
 * behind can be linked back to this account. One pseudonym for all of them keeps the
 * "one person = one contributor" rule intact for pending releases.
 */
export async function deleteAccount(sql: postgres.Sql, userId: string): Promise<void> {
  const userActor = hmacHex("user-actor", userId);
  const orphan = `deleted:${randomToken(24)}`;
  await sql.begin(async (tx) => {
    await tx`UPDATE aggregate_contributions SET actor_hash = ${orphan} WHERE actor_hash = ${userActor}`;
    await tx`UPDATE reports_private SET actor_hash = ${orphan}, user_id = NULL WHERE user_id = ${userId} OR actor_hash = ${userActor}`;
    await tx`DELETE FROM users WHERE id = ${userId}`;
  });
}
