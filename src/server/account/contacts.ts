import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { decryptText, encryptText, hashToken, hmacHex, randomToken } from "@/server/crypto";
import { ApiError } from "@/server/http/errors";
import { getEnv } from "@/server/config/env";
import { emailContact } from "@/server/providers/notify";

export const MAX_CONTACTS = 5;

export const contactSchema = z.object({ name: z.string().trim().min(1).max(60), email: z.email().max(254) }).strict();

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
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM contacts WHERE user_id = ${userId}`;
  if (n >= MAX_CONTACTS) throw new ApiError(409, "too_many_contacts", `You can add up to ${MAX_CONTACTS} trusted contacts.`);
  const token = randomToken(32);
  let row: Row;
  try {
    [row] = await sql<Row[]>`
      INSERT INTO contacts (user_id, name, encrypted_email, email_hash, invite_token_hash)
      VALUES (${userId}, ${input.name}, ${encryptText(email, "contact_email")}, ${hmacHex("contact-email", email)}, ${hashToken("invite", token)})
      RETURNING id, name, encrypted_email, is_default, invited_at, accepted_at`;
  } catch (err) {
    if ((err as { constraint_name?: string }).constraint_name === "contacts_user_id_email_hash_key") throw new ApiError(409, "duplicate_contact", "That person is already one of your contacts.");
    throw err;
  }
  const link = new URL(`/invite/${token}`, getEnv().APP_BASE_URL).toString();
  const sent = await emailContact(
    email,
    `${userName} added you as a trusted contact on MIRA`,
    [
      `Hi ${input.name},`,
      "",
      `${userName} would like you to be one of their trusted contacts on MIRA.`,
      "When they share a trip, you'll get a link to follow along live until they arrive — and a heads-up if they don't check in.",
      "",
      "Accept here:",
      link,
      "",
      "You'll only ever see their location while they're actively sharing a trip with you. You can say no by ignoring this email.",
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
    WHERE c.invite_token_hash = ${hashToken("invite", token)}`;
  return row ?? null;
}

export async function acceptContactInvite(sql: postgres.Sql, token: string): Promise<boolean> {
  const res = await sql`UPDATE contacts SET accepted_at = COALESCE(accepted_at, now()) WHERE invite_token_hash = ${hashToken("invite", token)}`;
  return res.count > 0;
}
