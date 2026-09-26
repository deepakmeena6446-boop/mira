import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { endSession, getUser } from "@/server/session/user";
import { deleteAccount } from "@/server/account/users";

export const dynamic = "force-dynamic";

/**
 * Sign out. A first-name-only account has no way back in once signed out, so signing out deletes it
 * (the Me screen says so before you confirm) rather than leaving orphaned data behind.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await getUser(sql);
  // A first-name-only account can't be signed back into; one with an email login can.
  const [demo] = user && !user.durable ? await sql`SELECT 1 FROM auth_accounts WHERE user_id = ${user.id} AND provider = 'demo'` : [];
  await endSession(sql);
  if (user && demo) await deleteAccount(sql, user.id);
  return json({ ok: true, deleted: Boolean(user && demo) });
});
