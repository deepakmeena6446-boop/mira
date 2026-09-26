import nodemailer from "nodemailer";
import { emailProvider, emailSender, getEnv, type ServerEnv } from "@/server/config/env";
import { createResendMailer } from "./resend";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  /**
   * Optional stable key for this logical message (Resend honours it for 24 h). Leave it unset
   * unless the same message could be sent twice by a retry: two different messages must never
   * share a key, or the second is silently dropped.
   */
  idempotencyKey?: string;
}

/**
 * `definite: true` means the provider refused the message (shown as failed);
 * `definite: false` means we can't know whether it was accepted (shown as unconfirmed).
 */
export type SendResult = { ok: true } | { ok: false; definite: boolean };

export interface Mailer {
  send(mail: OutgoingMail): Promise<SendResult>;
}

let cached: Mailer | null = null;

/**
 * The mailer every email in MIRA goes through (contact invites, trip links, missed-arrival
 * alerts, sign-in links): Resend's HTTPS API in production, SMTP (Mailpit) for local dev and
 * E2E. Null when neither is configured: callers must then say email is off.
 */
export function getMailer(): Mailer | null {
  const env = getEnv();
  const provider = emailProvider(env);
  if (provider === "none") return null;
  if (cached) return cached;
  cached = provider === "resend" ? createResendMailer({ apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM! }) : createSmtpMailer(env);
  return cached;
}

function createSmtpMailer(env: ServerEnv): Mailer {
  const from = emailSender(env);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    // Explicit EHLO name: the OS hostname can trigger slow mDNS lookups (e.g. *.local).
    name: new URL(env.APP_BASE_URL).hostname,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(mail) {
      try {
        await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
        return { ok: true };
      } catch (err) {
        return { ok: false, definite: isDefiniteFailure(err) };
      }
    },
  };
}

/** Test hook: forget the cached transport after env changes. */
export function resetMailer(): void {
  cached = null;
}

/** SMTP commands issued before the message body: a failure here means nothing was accepted. */
const PRE_DATA_COMMANDS = new Set(["CONN", "EHLO", "HELO", "LHLO", "STARTTLS", "AUTH PLAIN", "AUTH LOGIN", "AUTH XOAUTH2", "AUTH CRAM-MD5", "MAIL FROM", "RCPT TO"]);
const PRE_DATA_CODES = new Set(["ECONNECTION", "EDNS", "EAUTH", "EENVELOPE", "ETLS", "ECONNREFUSED"]);

/**
 * Definite failure: a 5xx refusal, or any error before DATA was sent. Anything at or
 * after DATA (e.g. the connection dropping before the final reply) is uncertain — the
 * server may have accepted the message — so it is reported as unconfirmed, not failed.
 */
export function isDefiniteFailure(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string; command?: string };
  if (typeof e.responseCode === "number" && e.responseCode >= 500) return true;
  if (e.command && PRE_DATA_COMMANDS.has(e.command.toUpperCase())) return true;
  if (e.code && PRE_DATA_CODES.has(e.code) && e.command !== "DATA") return true;
  return false;
}
