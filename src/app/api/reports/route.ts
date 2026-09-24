import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ensureActor } from "@/server/session/actor";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { prepareReport, reportInputSchema, submitReport } from "@/server/report/submit";
import { REPORT_LIMITS_ACTOR, REPORT_LIMITS_GLOBAL, REPORT_LIMITS_IP } from "@/server/report/limits";

export const dynamic = "force-dynamic";

/**
 * Anonymous private report intake. Returns an opaque acknowledgement only — no id,
 * status, or echo of submitted content — so the response cannot become a lookup.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], REPORT_LIMITS_IP, now);
  await enforce(sql, [dailyKey("global", "reports", now)], REPORT_LIMITS_GLOBAL, now);
  const input = await readJson(req, reportInputSchema, 16_384);
  const prepared = await prepareReport(sql, input); // fully validated before any cookie exists
  const actor = await ensureActor();
  await enforce(sql, [dailyKey("actor", actor.actorHash, now)], REPORT_LIMITS_ACTOR, now);
  const result = await submitReport(sql, actor.actorHash, prepared, systemClock);
  console.log(JSON.stringify({ t: now.toISOString(), src: "web", event: result.replay ? "report.replayed" : "report.received", report: result.id, held: result.held }));
  return json({ received: true }, result.replay ? 200 : 201);
});
