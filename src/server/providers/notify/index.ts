import "server-only";
import type postgres from "postgres";
import { getMailer } from "@/server/mail";

/**
 * Contact delivery + in-app inbox. Placeholder today: email through the configured
 * SMTP (Mailpit locally) and an in-app notification list instead of push.
 */
export async function emailContact(to: string, subject: string, text: string): Promise<{ ok: boolean; definite?: boolean }> {
  const mailer = getMailer();
  if (!mailer) return { ok: false, definite: true };
  const r = await mailer.send({ to, subject, text });
  return r.ok ? { ok: true } : { ok: false, definite: r.definite };
}

export async function notifyInApp(sql: postgres.Sql, userId: string, n: { kind: string; title: string; body: string; href?: string }): Promise<void> {
  await sql`INSERT INTO notifications (user_id, kind, title, body, href) VALUES (${userId}, ${n.kind}, ${n.title}, ${n.body}, ${n.href ?? null})`;
}
