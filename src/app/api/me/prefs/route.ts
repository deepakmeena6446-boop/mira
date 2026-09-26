import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireUser } from "@/server/session/user";
import { getPrefs, updatePrefs } from "@/server/account/habits";
import { travelPrefsPatchSchema } from "@/domain/travel-prefs";

export const dynamic = "force-dynamic";

/** Her explicit travel preferences, whether MIRA may learn habits, and (read-only) the Help Point classes she turned off. */
export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  return json(await getPrefs(sql, user.id));
});

/** { mode?: "walk"|"ride"|"transit"|null, shareByDefault?: boolean|null, rememberHabits?: boolean }. rememberHabits:false forgets every habit. */
export const PATCH = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const patch = await readJson(req, travelPrefsPatchSchema, 512);
  return json(await updatePrefs(sql, user.id, patch));
});
