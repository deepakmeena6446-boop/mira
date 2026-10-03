import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { point } from "@/server/http/geo-input";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { movementIntentSchema, plannedTimeSchema } from "@/domain/plan-contract";
import { haversineMeters } from "@/domain/pilot";
import { planOptionsFor, planOptionsForIntent } from "@/server/plan/options";
import { resolvedDestination, resolvedOrigin } from "@/domain/plan-state";
import { ApiError } from "@/server/http/errors";
import { recordDecisionOutcomeBestEffort } from "@/server/decision-outcomes";

export const dynamic = "force-dynamic";
const body = z.union([z.object({ intent: movementIntentSchema }).strict(), z.object({ from: point, to: point, departure: plannedTimeSchema }).strict()]);

/** Plan comparison uses only the public imported walking graph, never Google content or a route trace store. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const checkedAt = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), checkedAt)], [{ bucket: "geo:route:m", max: 480, windowMs: 60_000 }], checkedAt);
  const input = await readJson(req, body, 8_192);
  const from = "intent" in input ? resolvedOrigin(input.intent) : input.from;
  const to = "intent" in input ? input.intent.loop ? from : resolvedDestination(input.intent) : input.to;
  if (!from || !to) throw new ApiError(400, "unresolved_places", "Choose the named starting place and destination before comparing mapped options.");
  if ((!("intent" in input) || input.intent.mode === "walk") && haversineMeters(from, to) > 25_000) throw new ApiError(400, "too_far", "That's too far for a local walking comparison.");
  const result = "intent" in input ? await planOptionsForIntent(sql, input.intent, checkedAt) : await planOptionsFor(sql, from, to, input.departure, checkedAt);
  await recordDecisionOutcomeBestEffort(sql, result.state === "ready" ? "plan_option_ready" : "plan_option_partial", checkedAt);
  return json(result);
});
