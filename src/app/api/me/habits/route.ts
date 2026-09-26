import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireUser } from "@/server/session/user";
import { forgetHabits, getPrefs, listHabits } from "@/server/account/habits";

export const dynamic = "force-dynamic";

/** Everything MIRA remembers about her journeys, in words. */
export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  const [habits, prefs] = await Promise.all([listHabits(sql, user.id), getPrefs(sql, user.id)]);
  return json({ habits, rememberHabits: prefs.rememberHabits });
});

/** Forget all habits (learning stays as she set it). */
export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  return json({ forgotten: await forgetHabits(sql, user.id) });
});
