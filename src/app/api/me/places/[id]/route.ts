import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { requireUser } from "@/server/session/user";
import { removePlace } from "@/server/account/places";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/me/places/[id]">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) throw notFound();
  const sql = getSql();
  const user = await requireUser(sql);
  await removePlace(sql, user.id, id);
  return json({ ok: true });
});
