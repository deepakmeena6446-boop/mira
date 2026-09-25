import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireUser } from "@/server/session/user";
import { addPlace, listPlaces, savedPlaceSchema } from "@/server/account/places";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  return json({ places: await listPlaces(sql, user.id) });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const input = await readJson(req, savedPlaceSchema, 2048);
  return json({ place: await addPlace(sql, user.id, input) }, 201);
});
