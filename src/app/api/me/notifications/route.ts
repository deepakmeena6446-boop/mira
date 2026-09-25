import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireUser } from "@/server/session/user";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  const items = await sql`SELECT id, kind, title, body, href, read_at, created_at FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 30`;
  return json({ notifications: items });
});

/** Mark all as read. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${user.id} AND read_at IS NULL`;
  return json({ ok: true });
});
