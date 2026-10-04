import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { decryptText, encryptText, hashToken, hmacHex, randomToken } from "@/server/crypto";
import { getEnv, smtpConfigured } from "@/server/config/env";
import { emailContact } from "@/server/providers/notify";
import { signInLinkEmail, unknownAccountEmail } from "@/server/mail/templates";

/**
 * Durable accounts through a one-time email link (no password). The address is stored only
 * encrypted plus a keyed hash for lookup. The link token is single-use, expires in 20
 * minutes, and only its keyed hash is stored. The response never says whether an address
 * has an account (no enumeration): an unknown address gets an email that says so instead.
 */
export const LINK_TTL_MS = 20 * 60_000;
export const emailSchema = z.object({ email: z.email().max(254) }).strict();

export const emailHash = (email: string) => hmacHex("user-email", email.trim().toLowerCase());
export const COOKIE_MAX_AGE = 20 * 60;
export function signInCookieName(isProd: boolean): string {
  return isProd ? "__Host-mira_signin" : "mira_signin";
}

export function emailHint(enc: string | null): string | null {
  if (!enc) return null;
  const [u, d] = decryptText(enc, "user_email").split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(4, u.length - 2)))}@${d}`;
}

/** Send a sign-in link. `userId` set = she's signed in and is adding this email to her account. */
export async function requestSignInLink(sql: postgres.Sql, email: string, userId: string | null): Promise<{ sent: boolean }> {
  if (!smtpConfigured()) return { sent: false };
  const address = email.trim().toLowerCase();
  const hash = emailHash(address);
  const [owner] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email_hash = ${hash}`;
  // Signing in on a new device needs an existing account; adding an email to this account doesn't.
  if (!owner && !userId) {
    const mail = unknownAccountEmail();
    await emailContact(address, mail.subject, mail.text).catch(() => ({ ok: false }));
    return { sent: true };
  }
  const token = randomToken(32);
  await sql`INSERT INTO auth_links (token_hash, email_hash, email_enc, user_id, expires_at)
            VALUES (${hashToken("invite", `signin:${token}`)}, ${hash}, ${encryptText(address, "user_email")}, ${userId}, ${new Date(Date.now() + LINK_TTL_MS)})`;
  const mail = signInLinkEmail({ url: new URL(`/auth/link/${token}`, getEnv().APP_BASE_URL).toString(), adding: Boolean(userId && !owner) });
  const r = await emailContact(address, mail.subject, mail.text).catch(() => ({ ok: false }));
  return { sent: r.ok };
}

/**
 * Use a link once. Returns the account to sign in to: the existing account for that email,
 * or (when she asked to add the email) her own account, now durable. Null = invalid/expired/used.
 * An "add" link completes only in the browser signed in as the account that asked for it
 * (`currentUserId`): otherwise anyone could send someone a link that files their address — and
 * their future trips — under an account the sender controls.
 */
export async function consumeSignInLink(sql: postgres.Sql, token: string, currentUserId: string | null = null): Promise<{ userId: string; added: boolean } | { error: "other_account" } | null> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  return sql.begin(async (tx) => {
    const [link] = await tx<{ id: string; email_hash: string; email_enc: string; user_id: string | null }[]>`
      UPDATE auth_links SET used_at = now()
      WHERE token_hash = ${hashToken("invite", `signin:${token}`)} AND used_at IS NULL AND expires_at > now()
      RETURNING id, email_hash, email_enc, user_id`;
    if (!link) return null;
    const [owner] = await tx<{ id: string }[]>`SELECT id FROM users WHERE email_hash = ${link.email_hash}`;
    if (owner) return { userId: owner.id, added: false };
    if (!link.user_id) return null;
    if (link.user_id !== currentUserId) return { error: "other_account" as const };
    const [u] = await tx<{ id: string }[]>`UPDATE users SET email_hash = ${link.email_hash}, email_enc = ${link.email_enc} WHERE id = ${link.user_id} AND email_hash IS NULL RETURNING id`;
    if (!u) return null;
    await tx`INSERT INTO auth_accounts (provider, provider_user_id, user_id) VALUES ('email', ${link.email_hash}, ${u.id}) ON CONFLICT DO NOTHING`;
    return { userId: u.id, added: true };
  });
}

/**
 * What a sign-in link would do, without using it (audit L01-001 / P19-001): which account it opens (shown masked,
 * so she can tell it isn't hers), and whether it would switch this browser away from someone already signed in.
 */
export async function previewSignInLink(sql: postgres.Sql, token: string, currentUserId: string | null): Promise<{ emailHint: string | null; accountName: string | null; switching: boolean; adding: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  const [link] = await sql<{ email_hash: string; email_enc: string; user_id: string | null }[]>`
    SELECT email_hash, email_enc, user_id FROM auth_links WHERE token_hash = ${hashToken("invite", `signin:${token}`)} AND used_at IS NULL AND expires_at > now()`;
  if (!link) return null;
  const [owner] = await sql<{ id: string; name: string }[]>`SELECT id, name FROM users WHERE email_hash = ${link.email_hash}`;
  const target = owner?.id ?? link.user_id;
  return { emailHint: emailHint(link.email_enc), accountName: owner ? owner.name.split(" ")[0] : null, switching: Boolean(currentUserId && target && target !== currentUserId), adding: !owner };
}

export async function purgeAuthLinks(sql: postgres.Sql, now: Date): Promise<number> {
  return (await sql`DELETE FROM auth_links WHERE expires_at < ${new Date(now.getTime() - 86_400_000)}`).count;
}
