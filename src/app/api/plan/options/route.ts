import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { point } from "@/server/http/geo-input";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { plannedTimeSchema } from "@/domain/plan-contract";
import { haversineMeters } from "@/domain/pilot";
import { planOptionsFor } from "@/server/plan/options";
import { ApiError } from "@/server/http/errors";

export const dynamic = "force-dynamic";
const body = z.object({ from: point, to: point, departure: plannedTimeSchema }).strict();

/** Plan comparison uses only the public imported walking graph, never Google content or a route trace store. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const checkedAt = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), checkedAt)], [{ bucket: "geo:route:m", max: 480, windowMs: 60_000 }], checkedAt);
  const { from, to, departure } = await readJson(req, body, 512);
  if (haversineMeters(from, to) > 25_000) throw new ApiError(400, "too_far", "That's too far for a local walking comparison.");
  return json(await planOptionsFor(sql, from, to, departure, checkedAt));
});
