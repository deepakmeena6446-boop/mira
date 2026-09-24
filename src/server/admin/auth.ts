import "server-only";
import { cookies } from "next/headers";
import { verify } from "@node-rs/argon2";
import type postgres from "postgres";
import { getEnv, isProduction } from "@/server/config/env";
import { hashToken, randomToken } from "@/server/crypto";
import { ApiError, unauthorized } from "@/server/http/errors";
import { dailyKey, enforce } from "@/server/ratelimit";
import type { Clock } from "@/server/clock";

/** Moderator sessions: separate cookie, short-lived, strict same-site. */
export const ADMIN_SESSION_HOURS = 8;
const LOGIN_LIMITS = {
  ip: [{ bucket: "admin-login:ip", max: 5, windowMs: 15 * 60_000 }],
  global: [{ bucket: "admin-login:global", max: 30, windowMs: 15 * 60_000 }],
};

function adminCookieName(): string {
  return isProduction() ? "__Host-mira_admin" : "mira_admin";
}

export interface AdminSession {
  id: string;
  expiresAt: Date;
}

export async function login(sql: postgres.Sql, password: string, ip: string, clock: Clock): Promise<AdminSession> {
  const now = clock.now();
  // Throttle every attempt before doing the (deliberately slow) hash verification.
  await enforce(sql, [dailyKey("ip", ip, now)], LOGIN_LIMITS.ip, now);
  await enforce(sql, [dailyKey("global", "admin-login", now)], LOGIN_LIMITS.global, now);
  let ok = false;
  try {
    ok = password.length > 0 && password.length <= 256 && (await verify(getEnv().ADMIN_PASSWORD_HASH, password));
  } catch {
    ok = false;
  }
  if (!ok) throw new ApiError(401, "invalid_credentials", "That password isn't right.");
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_HOURS * 3600_000);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (${hashToken("admin", token)}, ${now}, ${expiresAt}) RETURNING id`;
  await sql`INSERT INTO admin_audit (admin_session_id, action, created_at) VALUES (${row.id}, 'login', ${now})`;
  (await cookies()).set(adminCookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
  return { id: row.id, expiresAt };
}

export async function getAdmin(sql: postgres.Sql, clock: Clock): Promise<AdminSession | null> {
  const token = (await cookies()).get(adminCookieName())?.value;
  if (!token || token.length > 128) return null;
  const [row] = await sql<{ id: string; expires_at: Date }[]>`
    SELECT id, expires_at FROM admin_sessions
    WHERE token_hash = ${hashToken("admin", token)} AND revoked_at IS NULL AND expires_at > ${clock.now()}`;
  return row ? { id: row.id, expiresAt: new Date(row.expires_at) } : null;
}

export async function requireAdmin(sql: postgres.Sql, clock: Clock): Promise<AdminSession> {
  const s = await getAdmin(sql, clock);
  if (!s) throw unauthorized();
  return s;
}

export async function logout(sql: postgres.Sql, clock: Clock): Promise<void> {
  const s = await getAdmin(sql, clock);
  if (s) {
    await sql`UPDATE admin_sessions SET revoked_at = ${clock.now()} WHERE id = ${s.id}`;
    await sql`INSERT INTO admin_audit (admin_session_id, action) VALUES (${s.id}, 'logout')`;
  }
  (await cookies()).delete(adminCookieName());
}
