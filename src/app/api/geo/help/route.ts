import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { getGeo } from "@/server/providers/geo";
import { helpPointsNear } from "@/server/help-points";

export const dynamic = "force-dynamic";

/** Coordinates, and optionally her country (ISO 3166-1 alpha-2, from the Country Context) for class weights. */
const body = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .nullish(),
  })
  .strict();

/**
 * Help Points around a point (coordinates in the POST body, never the URL), anywhere in the
 * world. Fetched ahead of time by Home and Trip so the "I feel unsafe" sheet can show one
 * instantly; the device ranks them for right now on its own clock (src/domain/help-points.ts).
 * The first few carry listed hours when the provider has them. An empty list means the map
 * data has none nearby — never that there's no help.
 */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:help:m", max: 240, windowMs: 60_000 }], now);
  const { country, ...p } = await readJson(req, body, 256);
  return json({ helpPoints: await helpPointsNear(getGeo(), p, { country }) });
});
