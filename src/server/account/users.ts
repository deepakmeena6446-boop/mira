import "server-only";
import type postgres from "postgres";
import { randomToken } from "@/server/crypto";

export async function createDemoUser(sql: postgres.Sql, name: string): Promise<string> {
  return sql.begin(async (tx) => {
    const [u] = await tx<{ id: string }[]>`INSERT INTO users (name) VALUES (${name}) RETURNING id`;
    await tx`INSERT INTO auth_accounts (provider, provider_user_id, user_id) VALUES ('demo', ${randomToken(12)}, ${u.id})`;
    return u.id;
  });
}

export async function updateProfile(sql: postgres.Sql, userId: string, patch: { name?: string; onboarded?: boolean }): Promise<void> {
  if (patch.name) await sql`UPDATE users SET name = ${patch.name} WHERE id = ${userId}`;
  if (patch.onboarded) await sql`UPDATE users SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = ${userId}`;
}

/** Deletes the account and everything tied to it (places, contacts, trips, chat, inbox). */
export async function deleteAccount(sql: postgres.Sql, userId: string): Promise<void> {
  await sql`DELETE FROM users WHERE id = ${userId}`;
}
