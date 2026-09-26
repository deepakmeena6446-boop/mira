import { z } from "zod";
import { personName } from "@/server/http/person-name";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { getUser, requireUser, endSession } from "@/server/session/user";
import { providerModes } from "@/server/providers/modes";
import { deleteAccount, updateProfile } from "@/server/account/users";
import { listPlaces } from "@/server/account/places";
import { listContacts } from "@/server/account/contacts";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  const user = await getUser(sql);
  if (!user) return json({ user: null, modes: providerModes() });
  const [places, contacts] = await Promise.all([listPlaces(sql, user.id), listContacts(sql, user.id)]);
  return json({ user, modes: providerModes(), places, contacts });
});

export const PATCH = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const body = await readJson(
    req,
    z.object({ name: personName(40).optional(), onboarded: z.literal(true).optional(), helpExclude: z.array(z.enum(["hospital", "police", "transit", "hotel", "pharmacy", "fuel"])).max(6).optional() }).strict(),
    1024,
  );
  await updateProfile(sql, user.id, body);
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  await deleteAccount(sql, user.id);
  await endSession(sql);
  return json({ ok: true });
});
