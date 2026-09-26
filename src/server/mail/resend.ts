import { randomUUID } from "node:crypto";
import type { Mailer, OutgoingMail, SendResult } from "./index";

/**
 * Resend HTTPS API adapter (https://resend.com/docs/api-reference/emails/send-email).
 * Used in production instead of SMTP: many hosts block outbound SMTP, HTTPS is always open.
 *
 * Outcome mapping, matching the SMTP adapter's semantics:
 *   2xx                          → sent
 *   4xx (not 408/409)            → definite failure: Resend refused it (bad sender, bad key, 429…)
 *   5xx, 408, 409, timeout, drop → unconfirmed: it may or may not have been accepted
 *   connection never opened      → definite failure (DNS / refused: nothing left this machine)
 *
 * Uncertain outcomes are retried once with the same Idempotency-Key, so Resend delivers at
 * most one copy (keys are honoured for 24 h). Logs carry status codes only: never the
 * address, subject or body.
 */

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;

export interface ResendOptions {
  apiKey: string;
  from: string;
  /** Per-attempt timeout (default 10 s). */
  timeoutMs?: number;
  /** Test hook; defaults to the global fetch at call time. */
  fetch?: typeof fetch;
  /** Test hook for the pause before the single retry. */
  retryDelayMs?: number;
  log?: (event: string, fields: Record<string, unknown>) => void;
}

type Attempt = { ok: true } | { ok: false; definite: boolean; retry: boolean; status: number | null; reason: string };

/** Network errors raised before any byte of the request could reach Resend. */
const PRE_SEND_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ERR_INVALID_URL"]);

function defaultLog(event: string, fields: Record<string, unknown>): void {
  console.warn(JSON.stringify({ t: new Date().toISOString(), src: "mail", event, ...fields }));
}

export function classifyStatus(status: number): Attempt {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 408 || status === 409 || status >= 500) return { ok: false, definite: false, retry: true, status, reason: "http_uncertain" };
  return { ok: false, definite: true, retry: false, status, reason: "http_rejected" };
}

export function classifyNetworkError(err: unknown): Attempt {
  const e = err as { name?: string; cause?: { code?: string; name?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || e?.cause?.name === "TimeoutError") {
    return { ok: false, definite: false, retry: true, status: null, reason: "timeout" };
  }
  const code = e?.cause?.code;
  if (code && PRE_SEND_CODES.has(code)) return { ok: false, definite: true, retry: true, status: null, reason: "connect_failed" };
  return { ok: false, definite: false, retry: true, status: null, reason: "network" };
}

export function createResendMailer(opts: ResendOptions): Mailer {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = opts.log ?? defaultLog;

  async function attempt(mail: OutgoingMail, idempotencyKey: string): Promise<Attempt> {
    const doFetch = opts.fetch ?? globalThis.fetch;
    try {
      const res = await doFetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "user-agent": "mira-server",
        },
        body: JSON.stringify({ from: opts.from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      // Don't read error bodies: they can echo the recipient address.
      await res.body?.cancel().catch(() => {});
      return classifyStatus(res.status);
    } catch (err) {
      return classifyNetworkError(err);
    }
  }

  return {
    async send(mail: OutgoingMail): Promise<SendResult> {
      const key = mail.idempotencyKey ?? `mira-${randomUUID()}`;
      let uncertain = false;
      for (let i = 0; i < 2; i++) {
        const r = await attempt(mail, key);
        if (r.ok) {
          if (i > 0) log("mail.sent_after_retry", { provider: "resend" });
          return { ok: true };
        }
        uncertain ||= !r.definite;
        log("mail.send_failed", { provider: "resend", attempt: i + 1, status: r.status, reason: r.reason });
        if (!r.retry || i === 1) break;
        await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? RETRY_DELAY_MS));
      }
      return { ok: false, definite: !uncertain };
    },
  };
}
