import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import webpush from "web-push";
import { decryptText, encryptText, hmacHex } from "@/server/crypto";
import { getEnv } from "@/server/config/env";

/**
 * Web Push to the traveller: her own updates (contact accepted, missed check-in, location
 * paused, an alert that may not have gone out), so she learns them even with MIRA closed.
 * Every update is already written to `notifications` (web and worker); a worker job pushes
 * each one once. Payloads carry a title, a sentence and a path — never a location. The
 * subscription is a capability URL, so it's stored encrypted.
 */
export const subscriptionSchema = z
  .object({
    endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "must be https"),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }).strict(),
  })
  .strict();
export type PushSubscriptionJson = z.infer<typeof subscriptionSchema>;

export function pushConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}
export function vapidPublicKey(): string | null {
  return pushConfigured() ? getEnv().VAPID_PUBLIC_KEY! : null;
}

export async function saveSubscription(sql: postgres.Sql, userId: string, sub: PushSubscriptionJson): Promise<void> {
  const hash = hmacHex("push-endpoint", sub.endpoint);
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint_hash, subscription_enc) VALUES (${userId}, ${hash}, ${encryptText(JSON.stringify(sub), "push_subscription")})
    ON CONFLICT (endpoint_hash) DO UPDATE SET user_id = EXCLUDED.user_id, subscription_enc = EXCLUDED.subscription_enc`;
}

export async function removeSubscription(sql: postgres.Sql, userId: string, endpoint: string): Promise<void> {
  await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId} AND endpoint_hash = ${hmacHex("push-endpoint", endpoint)}`;
}

export async function hasSubscription(sql: postgres.Sql, userId: string): Promise<boolean> {
  return (await sql`SELECT 1 FROM push_subscriptions WHERE user_id = ${userId} LIMIT 1`).length > 0;
}

/** What actually sends (swappable in tests). Resolves to the push service's HTTP status. */
export type PushSender = (sub: PushSubscriptionJson, payload: string) => Promise<number>;

export function webPushSender(): PushSender {
  const e = getEnv();
  webpush.setVapidDetails(e.VAPID_SUBJECT ?? e.APP_BASE_URL, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  return async (sub, payload) => {
    try {
      const r = await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "high", timeout: 10_000 });
      return r.statusCode;
    } catch (err) {
      return (err as { statusCode?: number }).statusCode ?? 0;
    }
  };
}

/** Kinds worth interrupting her for. The welcome note stays in the inbox. */
const PUSHED_KINDS = ["contact_accepted", "trip_missed", "trip_alert_failed", "location_paused", "check_requested"];

/** Worker: push inbox items created in the last 15 minutes that haven't been pushed yet. */
export async function drainPushOutbox(sql: postgres.Sql, send: PushSender, now: Date): Promise<{ pushed: number; removed: number }> {
  const items = await sql<{ id: number; user_id: string; kind: string; title: string; body: string; href: string | null }[]>`
    UPDATE notifications n SET pushed_at = ${now}
    WHERE n.id IN (
      SELECT id FROM notifications WHERE pushed_at IS NULL AND created_at > ${new Date(now.getTime() - 15 * 60_000)} AND kind = ANY(${PUSHED_KINDS})
      ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED)
    RETURNING n.id, n.user_id, n.kind, n.title, n.body, n.href`;
  let pushed = 0;
  let removed = 0;
  for (const n of items) {
    const subs = await sql<{ id: string; subscription_enc: string }[]>`SELECT id, subscription_enc FROM push_subscriptions WHERE user_id = ${n.user_id}`;
    for (const s of subs) {
      let sub: PushSubscriptionJson;
      try {
        sub = JSON.parse(decryptText(s.subscription_enc, "push_subscription")) as PushSubscriptionJson;
      } catch {
        await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
        removed += 1;
        continue;
      }
      const status = await send(sub, JSON.stringify({ title: n.title, body: n.body, href: n.href ?? "/inbox", tag: n.kind }));
      if (status === 404 || status === 410) {
        await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`; // the browser dropped it
        removed += 1;
      } else if (status >= 200 && status < 300) {
        await sql`UPDATE push_subscriptions SET last_ok_at = ${now} WHERE id = ${s.id}`;
        pushed += 1;
      }
    }
  }
  return { pushed, removed };
}
