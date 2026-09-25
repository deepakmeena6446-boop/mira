import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { requireUser } from "@/server/session/user";
import { removeContact, setDefault } from "@/server/account/contacts";

export const dynamic = "force-dynamic";

async function idOf(ctx: RouteContext<"/api/me/contacts/[id]">) {
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) throw notFound();
  return id;
}

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/me/contacts/[id]">) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  await removeContact(sql, user.id, await idOf(ctx));
  return json({ ok: true });
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/me/contacts/[id]">) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const { isDefault } = await readJson(req, z.object({ isDefault: z.boolean() }).strict(), 256);
  await setDefault(sql, user.id, await idOf(ctx), isDefault);
  return json({ ok: true });
});
