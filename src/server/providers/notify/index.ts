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

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(sql: postgres.Sql, userId: string): Promise<InboxItem[]> {
  const rows = await sql<{ id: string; kind: string; title: string; body: string; href: string | null; read_at: Date | null; created_at: Date }[]>`
    SELECT id::text, kind, title, body, href, read_at, created_at FROM notifications WHERE user_id = ${userId} ORDER BY created_at DESC, id DESC LIMIT 30`;
  return rows.map((r) => ({ ...r, read_at: r.read_at ? new Date(r.read_at).toISOString() : null, created_at: new Date(r.created_at).toISOString() }));
}
