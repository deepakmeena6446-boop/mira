import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { requireUser } from "@/server/session/user";
import { addContact, contactSchema, listContacts } from "@/server/account/contacts";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  return json({ contacts: await listContacts(sql, user.id) });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const now = new Date();
  await enforce(sql, [dailyKey("actor", user.id, now), dailyKey("ip", clientIp(req), now)], [{ bucket: "contacts:add:h", max: 10, windowMs: 3600_000 }], now);
  const input = await readJson(req, contactSchema, 1024);
  return json({ contact: await addContact(sql, user.id, user.name, input) }, 201);
});
