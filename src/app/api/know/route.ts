import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { notFound, unavailable } from "@/server/http/errors";
import { knowPlace, knowRoute, KnowUnavailableError } from "@/server/know";
import { systemClock } from "@/server/clock";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

const uuid = z.guid();
const time = z.enum(["now", "evening", "late"]).default("now");
const coord = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict();

const body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("place"), placeId: uuid, time }).strict(),
  z
    .object({
      mode: z.literal("route"),
      origin: z.union([z.object({ placeId: uuid }).strict(), coord]),
      destination: z.object({ placeId: uuid }).strict(),
      time,
    })
    .strict(),
]);

/**
 * Public place/route evidence. POST keeps origin/destination and any coordinates out
 * of URLs and logs. Response contains only sourced facts and released aggregates.
 */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "know", max: 120, windowMs: 60_000 }], now);
  const input = await readJson(req, body, 4096);
  try {
    const res =
      input.mode === "place"
        ? await knowPlace(sql, input.placeId, input.time, systemClock)
        : await knowRoute(sql, input.origin, input.destination.placeId, input.time, systemClock);
    if (!res) throw notFound("That place isn't in the pilot map.");
    return json(res);
  } catch (err) {
    if (err instanceof KnowUnavailableError) throw unavailable("map_unavailable", "Pilot map data isn't loaded.");
    throw err;
  }
});
