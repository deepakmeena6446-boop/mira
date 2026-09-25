import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireUser } from "@/server/session/user";
import { listNotifications } from "@/server/providers/notify";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  return json({ notifications: await listNotifications(sql, user.id) });
});

/** Mark all as read. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${user.id} AND read_at IS NULL`;
  return json({ ok: true });
});
