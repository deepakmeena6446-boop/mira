import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { unavailable } from "@/server/http/errors";
import { requireUser } from "@/server/session/user";
import { hasSubscription, removeSubscription, saveSubscription, subscriptionSchema, vapidPublicKey } from "@/server/providers/notify/push";

export const dynamic = "force-dynamic";

/** Whether push is available, its public key, and whether this account has a subscription. */
export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  return json({ publicKey: vapidPublicKey(), subscribed: await hasSubscription(sql, user.id) });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  if (!vapidPublicKey()) throw unavailable("push_unavailable", "Notifications aren't switched on in this version yet.");
  const { subscription } = await readJson(req, z.object({ subscription: subscriptionSchema }).strict(), 4096);
  await saveSubscription(sql, user.id, subscription);
  return json({ ok: true }, 201);
});

export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const { endpoint } = await readJson(req, z.object({ endpoint: z.string().max(1000) }).strict(), 2048);
  await removeSubscription(sql, user.id, endpoint);
  return json({ ok: true });
});
