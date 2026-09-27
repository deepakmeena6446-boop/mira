import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { decryptText, encryptText, hashToken, hmacHex, randomToken } from "@/server/crypto";
import { ApiError } from "@/server/http/errors";
import { personName } from "@/server/http/person-name";
import { emailSenderAddress, getEnv } from "@/server/config/env";
import { emailContact, notifyInApp } from "@/server/providers/notify";
import { findCountry } from "@/server/locale";
import { normalizePhone, phoneHint } from "@/domain/phone";

export { MAX_CONTACTS } from "@/domain/limits";
import { MAX_CONTACTS } from "@/domain/limits";

/**
 * A trusted contact: a WhatsApp number (she sends them her live link in one tap), an email (MIRA
 * invites them and can email the automatic missed-arrival alert), or both. `country` is her
 * country (ISO), used to complete a local number with its calling code.
 */
export const contactSchema = z
  .object({
    name: personName(60),
    email: z.email().max(254).optional(),
    phone: z.string().trim().min(1).max(32).optional(),
    country: z.string().regex(/^[A-Z]{2}$/).optional(),
  })
  .strict()
  .refine((v) => v.email || v.phone, { message: "Add a WhatsApp number or an email.", path: ["phone"] });

/** Invite links are single-use and expire after a week. */
export const INVITE_TTL_MS = 7 * 86_400_000;

export interface Contact {
  id: string;
  name: string;
  emailHint: string | null;
  /** Her own contact's number, E.164 — sent only to her, to open WhatsApp with it. */
  phone: string | null;
  phoneHint: string | null;
  isDefault: boolean;
  /** Email invite state; "phone" = no email, so nothing to accept (she messages them herself). */
  status: "invited" | "accepted" | "invite_failed" | "phone";
}

type Row = { id: string; name: string; encrypted_email: string | null; phone_enc: string | null; is_default: boolean; invited_at: Date | null; accepted_at: Date | null };
const ROW_COLS = "id, name, encrypted_email, phone_enc, is_default, invited_at, accepted_at";

function hint(email: string): string {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(4, u.length - 2)))}@${d}`;
}

function toContact(r: Row): Contact {
  const phone = r.phone_enc ? decryptText(r.phone_enc, "contact_phone") : null;
  return {
    id: r.id,
    name: r.name,
    emailHint: r.encrypted_email ? hint(decryptText(r.encrypted_email, "contact_email")) : null,
    phone,
    phoneHint: phone ? phoneHint(phone) : null,
    isDefault: r.is_default,
    status: !r.encrypted_email ? "phone" : r.accepted_at ? "accepted" : r.invited_at ? "invited" : "invite_failed",
  };
}

export async function listContacts(sql: postgres.Sql, userId: string): Promise<Contact[]> {
  const rows = await sql<Row[]>`SELECT ${sql.unsafe(ROW_COLS)} FROM contacts WHERE user_id = ${userId} ORDER BY created_at`;
  return rows.map(toContact);
}

/** Add a trusted contact; with an email, also email them a one-time acceptance link. */
export async function addContact(sql: postgres.Sql, userId: string, userName: string, input: z.infer<typeof contactSchema>): Promise<Contact> {
  const email = input.email?.trim().toLowerCase() ?? null;
  const calling = input.country ? (findCountry(input.country)?.callingCode.replace("-", "") ?? null) : null;
  const phone = input.phone ? normalizePhone(input.phone, calling) : null;
  if (input.phone && !phone) throw new ApiError(400, "invalid_phone", "That doesn't look like a phone number. Add it with its country code, like +91 98765 43210.", { fields: ["phone"] });
  const token = email ? randomToken(32) : null;
  let row: Row;
  try {
    // Count + insert under a per-user lock so a double tap or two tabs can't exceed the limit.
    row = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`contacts:${userId}`}))`;
      const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM contacts WHERE user_id = ${userId}`;
      if (n >= MAX_CONTACTS) throw new ApiError(409, "too_many_contacts", `You can add up to ${MAX_CONTACTS} trusted contacts.`);
      const [r] = await tx<Row[]>`
        INSERT INTO contacts (user_id, name, encrypted_email, email_hash, invite_token_hash, phone_enc, phone_hash)
        VALUES (${userId}, ${input.name}, ${email ? encryptText(email, "contact_email") : null}, ${email ? hmacHex("contact-email", email) : null},
                ${token ? hashToken("invite", token) : null}, ${phone ? encryptText(phone, "contact_phone") : null}, ${phone ? hmacHex("contact-phone", phone) : null})
        RETURNING ${sql.unsafe(ROW_COLS)}`;
      return r;
    });
  } catch (err) {
    const constraint = (err as { constraint_name?: string }).constraint_name;
    if (constraint === "contacts_user_id_email_hash_key" || constraint === "contacts_user_phone_key") throw new ApiError(409, "duplicate_contact", "That person is already one of your contacts.");
    throw err;
  }
  if (!email || !token) return toContact(row); // WhatsApp only: no invite — she sends them her link herself
  const link = new URL(`/invite/${token}`, getEnv().APP_BASE_URL).toString();
  const sender = emailSenderAddress();
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

/** Default contacts with a WhatsApp number — she opens WhatsApp to each with their own live link. */
export async function phoneTargets(sql: postgres.Sql, userId: string): Promise<Array<{ id: string; name: string; phone: string }>> {
  const rows = await sql<{ id: string; name: string; phone_enc: string }[]>`
    SELECT id, name, phone_enc FROM contacts WHERE user_id = ${userId} AND phone_enc IS NOT NULL AND is_default`;
  return rows.map((r) => ({ id: r.id, name: r.name, phone: decryptText(r.phone_enc, "contact_phone") }));
}

/** Accepted, default contacts with decrypted addresses — only for sending trip links. */
export async function shareTargets(sql: postgres.Sql, userId: string): Promise<Array<{ id: string; name: string; email: string }>> {
  const rows = await sql<{ id: string; name: string; encrypted_email: string }[]>`
    SELECT id, name, encrypted_email FROM contacts WHERE user_id = ${userId} AND accepted_at IS NOT NULL AND encrypted_email IS NOT NULL AND is_default`;
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
      href: "/circle",
    });
    return true;
  }
  return false;
}
