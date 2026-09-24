import nodemailer from "nodemailer";
import { getEnv, smtpConfigured } from "@/server/config/env";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * `definite: true` means the SMTP server refused the message (shown as failed);
 * `definite: false` means we can't know whether it was accepted (shown as unconfirmed).
 */
export type SendResult = { ok: true } | { ok: false; definite: boolean };

export interface Mailer {
  send(mail: OutgoingMail): Promise<SendResult>;
}

let cached: Mailer | null = null;

export function getMailer(): Mailer | null {
  if (!smtpConfigured()) return null;
  if (cached) return cached;
  const env = getEnv();
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
  cached = {
    async send(mail) {
      try {
        await transport.sendMail({ from: env.SMTP_FROM, to: mail.to, subject: mail.subject, text: mail.text });
        return { ok: true };
      } catch (err) {
        const code = (err as { responseCode?: number; code?: string }).responseCode;
        const errCode = (err as { code?: string }).code;
        // 5xx = permanent refusal; connection errors before DATA mean nothing was accepted.
        const definite = (typeof code === "number" && code >= 500) || errCode === "ECONNREFUSED" || errCode === "EENVELOPE";
        return { ok: false, definite };
      }
    },
  };
  return cached;
}

/** Test hook: forget the cached transport after env changes. */
export function resetMailer(): void {
  cached = null;
}
