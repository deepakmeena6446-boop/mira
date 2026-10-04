import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireUser } from "@/server/session/user";
import { z } from "zod";
import { notFound } from "@/server/http/errors";
import { forgetHabit, forgetHabits, getPrefs, listHabits } from "@/server/account/habits";
import { TRAVEL_MODES } from "@/domain/travel-prefs";

export const dynamic = "force-dynamic";

/** Everything MIRA remembers about her journeys, in words. */
export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  const [habits, prefs] = await Promise.all([listHabits(sql, user.id), getPrefs(sql, user.id)]);
  return json({ habits, rememberHabits: prefs.rememberHabits });
});

const one = z.object({ place: z.guid(), mode: z.enum([...TRAVEL_MODES, "other"]), hour: z.coerce.number().int().min(0).max(23) });

/** Forget all habits, or one (`?place=&mode=&hour=`). Learning stays as she set it. */
export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const q = Object.fromEntries(new URL(req.url).searchParams);
  if (q.place !== undefined) {
    const key = one.safeParse(q);
    if (!key.success || !await forgetHabit(sql, user.id, { placeId: key.data.place, mode: key.data.mode, startHour: key.data.hour })) throw notFound();
    return json({ forgotten: 1 });
  }
  return json({ forgotten: await forgetHabits(sql, user.id) });
});
