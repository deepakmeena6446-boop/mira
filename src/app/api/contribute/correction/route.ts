import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { requireUser } from "@/server/session/user";
import { getGeo } from "@/server/providers/geo";
import { CORRECTIONS } from "@/domain/contributions";
import { submitCorrection } from "@/server/contributions";

export const dynamic = "force-dynamic";

// Structured only: no free text. Coordinates travel in the body (never a URL) and are not stored.
const body = z
  .object({
    placeKey: z.string().max(280).optional(),
    name: z.string().trim().min(1).max(120),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    claim: z.enum(CORRECTIONS),
    country: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  })
  .strict();

/** "Correct something": hours wrong / entrance closed / place gone / not this kind of place. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const now = new Date();
  await enforce(sql, [dailyKey("actor", user.id, now)], [{ bucket: "contrib:correct:d", max: 10, windowMs: 86_400_000 }], now);
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "contrib:correct:ip:h", max: 60, windowMs: 3600_000 }], now);
  const input = await readJson(req, body, 1024);
  const r = await submitCorrection(sql, getGeo(), user, { ...input, country: input.country ?? null }, now);
  return json({ ok: true, outcome: r.outcome, placeName: r.placeName });
});
