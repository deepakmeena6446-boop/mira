import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { getUser } from "@/server/session/user";
import { suggestionFor } from "@/server/account/habits";
import { hourIn, isValidTimeZone } from "@/lib/time";
import { JOURNEY_MODES } from "@/server/trips";

export const dynamic = "force-dynamic";

const query = z.object({
  hour: z.coerce.number().int().min(0).max(23).optional(),
  tz: z.string().max(64).optional(),
  mode: z.enum(JOURNEY_MODES).optional(),
});

/**
 * GET /api/me/habits/suggestion?hour=21 (her local hour) or ?tz=Europe/London, optional &mode=walk.
 * { suggestion } is null unless her own finished journeys back it (Home then shows its generic nudge).
 * Without her local hour there is no honest "usual time", so no suggestion.
 */
export const GET = handle(async (req: Request) => {
  const sql = getSql();
  const user = await getUser(sql);
  if (!user) return json({ suggestion: null });
  const p = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ suggestion: null });
  const hour = p.data.hour ?? (isValidTimeZone(p.data.tz) ? hourIn(new Date(), p.data.tz) : null);
  if (hour === null) return json({ suggestion: null });
  return json({ suggestion: await suggestionFor(sql, user.id, hour, { mode: p.data.mode }) });
});
