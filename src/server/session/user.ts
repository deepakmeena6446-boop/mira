import "server-only";
import { cookies } from "next/headers";
import type postgres from "postgres";
import { getSql } from "@/server/db/client";
import { hashToken, randomToken } from "@/server/crypto";
import { unauthorized } from "@/server/http/errors";
import { isProduction } from "@/server/config/env";

/** Signed-in user sessions (MIRA 2.0 accounts). Only a keyed hash of the token is stored. */
export const USER_SESSION_DAYS = 60;

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  onboarded: boolean;
}

function cookieName(): string {
  return isProduction() ? "__Host-mira_session" : "mira_session";
}

type UserRow = { id: string; name: string; email: string | null; avatar_url: string | null; onboarded_at: Date | null };
const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, email: r.email, avatarUrl: r.avatar_url, onboarded: r.onboarded_at !== null });

export async function getUser(sql: postgres.Sql = getSql()): Promise<User | null> {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || token.length > 128) return null;
  const [row] = await sql<UserRow[]>`
    SELECT u.id, u.name, u.email, u.avatar_url, u.onboarded_at FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken("admin", `user:${token}`)} AND s.expires_at > now()`;
  return row ? toUser(row) : null;
}

export async function requireUser(sql: postgres.Sql = getSql()): Promise<User> {
  const u = await getUser(sql);
  if (!u) throw unauthorized();
  return u;
}

export async function startSession(sql: postgres.Sql, userId: string): Promise<void> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + USER_SESSION_DAYS * 86_400_000);
  await sql`INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${hashToken("admin", `user:${token}`)}, ${expires})`;
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: USER_SESSION_DAYS * 86_400,
  });
}

export async function endSession(sql: postgres.Sql): Promise<void> {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  if (token) await sql`DELETE FROM user_sessions WHERE token_hash = ${hashToken("admin", `user:${token}`)}`;
  store.delete(cookieName());
}

/** Pseudonymous, stable per-user key used where the V0 code expects an actor hash. */
export function userActorHash(userId: string, hmac: (p: string, v: string) => string): string {
  return hmac("user-actor", userId);
}
