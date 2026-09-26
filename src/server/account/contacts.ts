import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { decryptText, encryptText, hashToken, hmacHex, randomToken } from "@/server/crypto";
import { ApiError } from "@/server/http/errors";
import { personName } from "@/server/http/person-name";
import { getEnv } from "@/server/config/env";
import { emailContact, notifyInApp } from "@/server/providers/notify";

export { MAX_CONTACTS } from "@/domain/limits";
import { MAX_CONTACTS } from "@/domain/limits";

export const contactSchema = z.object({ name: personName(60), email: z.email().max(254) }).strict();

/** Invite links are single-use and expire after a week. */
export const INVITE_TTL_MS = 7 * 86_400_000;

export interface Contact {
  id: string;
  name: string;
  emailHint: string;
  isDefault: boolean;
  status: "invited" | "accepted" | "invite_failed";
}

type Row = { id: string; name: string; encrypted_email: string; is_default: boolean; invited_at: Date | null; accepted_at: Date | null };

function hint(email: string): string {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(4, u.length - 2)))}@${d}`;
}

function toContact(r: Row): Contact {
  return {
    id: r.id,
    name: r.name,
    emailHint: hint(decryptText(r.encrypted_email, "contact_email")),
    isDefault: r.is_default,
    status: r.accepted_at ? "accepted" : r.invited_at ? "invited" : "invite_failed",
  };
}

export async function listContacts(sql: postgres.Sql, userId: string): Promise<Contact[]> {
  const rows = await sql<Row[]>`SELECT id, name, encrypted_email, is_default, invited_at, accepted_at FROM contacts WHERE user_id = ${userId} ORDER BY created_at`;
  return rows.map(toContact);
}

/** Add a trusted contact and email them a one-time acceptance link. */
export async function addContact(sql: postgres.Sql, userId: string, userName: string, input: z.infer<typeof contactSchema>): Promise<Contact> {
  const email = input.email.trim().toLowerCase();
  const token = randomToken(32);
  let row: Row;
  try {
    // Count + insert under a per-user lock so a double tap or two tabs can't exceed the limit.
    row = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`contacts:${userId}`}))`;
      const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM contacts WHERE user_id = ${userId}`;
      if (n >= MAX_CONTACTS) throw new ApiError(409, "too_many_contacts", `You can add up to ${MAX_CONTACTS} trusted contacts.`);
      const [r] = await tx<Row[]>`
        INSERT INTO contacts (user_id, name, encrypted_email, email_hash, invite_token_hash)
        VALUES (${userId}, ${input.name}, ${encryptText(email, "contact_email")}, ${hmacHex("contact-email", email)}, ${hashToken("invite", token)})
        RETURNING id, name, encrypted_email, is_default, invited_at, accepted_at`;
      return r;
    });
  } catch (err) {
    if ((err as { constraint_name?: string }).constraint_name === "contacts_user_id_email_hash_key") throw new ApiError(409, "duplicate_contact", "That person is already one of your contacts.");
    throw err;
  }
  const link = new URL(`/invite/${token}`, getEnv().APP_BASE_URL).toString();
  const sender = /<([^>]+)>/.exec(getEnv().SMTP_FROM ?? "")?.[1] ?? getEnv().SMTP_FROM ?? null;
  const sent = await emailContact(
    email,
    // Fixed subject: user-chosen names stay in the body only.
    "You've been invited to be a trusted contact on MIRA",
    [
      `Hi ${input.name},`,
      "",
      `${userName} would like you to be one of their trusted contacts on MIRA.`,
      "When they share a journey, MIRA emails you a link to follow along live until they arrive — and emails you if they don't check in.",
      "",
      "Accept here:",
      link,
      "",
      ...(sender ? [`So those emails never land in spam, add ${sender} to your contacts.`, ""] : []),
      "You'll only ever see their location while they're actively sharing a journey with you. You can say no by ignoring this email.",
      "This link works once and expires in 7 days.",
    ].join("\n"),
  );
  if (sent.ok) {
    await sql`UPDATE contacts SET invited_at = now() WHERE id = ${row.id}`;
    row = { ...row, invited_at: new Date() };
  }
  return toContact(row);
}

export async function removeContact(sql: postgres.Sql, userId: string, id: string): Promise<void> {
  await sql`DELETE FROM contacts WHERE id = ${id} AND user_id = ${userId}`;
}

export async function setDefault(sql: postgres.Sql, userId: string, id: string, isDefault: boolean): Promise<void> {
  await sql`UPDATE contacts SET is_default = ${isDefault} WHERE id = ${id} AND user_id = ${userId}`;
}

/** Accepted, default contacts with decrypted addresses — only for sending trip links. */
export async function shareTargets(sql: postgres.Sql, userId: string): Promise<Array<{ id: string; name: string; email: string }>> {
  const rows = await sql<{ id: string; name: string; encrypted_email: string }[]>`
    SELECT id, name, encrypted_email FROM contacts WHERE user_id = ${userId} AND accepted_at IS NOT NULL AND is_default`;
  return rows.map((r) => ({ id: r.id, name: r.name, email: decryptText(r.encrypted_email, "contact_email") }));
}

export async function contactInviteView(sql: postgres.Sql, token: string) {
  if (!token || token.length > 128) return null;
  const [row] = await sql<{ id: string; name: string; accepted_at: Date | null; owner: string }[]>`
    SELECT c.id, c.name, c.accepted_at, u.name AS owner FROM contacts c JOIN users u ON u.id = c.user_id
    WHERE c.invite_token_hash = ${hashToken("invite", token)} AND COALESCE(c.invited_at, c.created_at) > ${new Date(Date.now() - INVITE_TTL_MS)}`;
  return row ?? null;
}

export async function acceptContactInvite(sql: postgres.Sql, token: string): Promise<boolean> {
  const hash = hashToken("invite", token);
  // First acceptance only: tells the owner once; accepting again is a harmless no-op.
  // Single use: accepting clears the token, so an old or forwarded invite email reveals nothing later.
  const [first] = await sql<{ user_id: string; name: string }[]>`
    UPDATE contacts SET accepted_at = now(), invite_token_hash = NULL
    WHERE invite_token_hash = ${hash} AND accepted_at IS NULL AND COALESCE(invited_at, created_at) > ${new Date(Date.now() - INVITE_TTL_MS)}
    RETURNING user_id, name`;
  if (first) {
    await notifyInApp(sql, first.user_id, {
      kind: "contact_accepted",
      title: `${first.name} accepted your invite`,
      body: `${first.name} can now follow along live whenever you share a trip.`,
      href: "/me#contacts",
    });
    return true;
  }
  return false;
}
