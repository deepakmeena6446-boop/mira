import type postgres from "postgres";

/** Fixed vocabulary prevents sensitive intent, coordinates or identity entering product metrics. */
export type DecisionOutcome = "plan_option_ready" | "plan_option_partial" | "plan_answer_ready" | "plan_answer_partial" | "journey_started" | "journey_changed" | "journey_arrived" | "journey_ended";
export const DECISION_OUTCOME_DAYS = 30;

/** Closing a journey is a state transition, never proof of a useful decision. */
export function outcomeForTripClose(action: "arrive" | "end"): "journey_arrived" | "journey_ended" {
  return action === "arrive" ? "journey_arrived" : "journey_ended";
}

export async function recordDecisionOutcome(sql: postgres.Sql, event: DecisionOutcome, now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await sql`INSERT INTO decision_outcomes (day, event, count) VALUES (${day}::date, ${event}, 1)
    ON CONFLICT (day, event) DO UPDATE SET count = decision_outcomes.count + 1`;
}

/** Metrics cannot hold up a journey or turn a useful partial answer into an error. */
export async function recordDecisionOutcomeBestEffort(sql: postgres.Sql, event: DecisionOutcome, now: Date): Promise<void> {
  try { await recordDecisionOutcome(sql, event, now); }
  catch { console.warn(JSON.stringify({ t: now.toISOString(), src: "web", event: "decision_outcome.write_failed" })); }
}

export async function purgeDecisionOutcomes(sql: postgres.Sql, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DECISION_OUTCOME_DAYS * 86_400_000).toISOString().slice(0, 10);
  const result = await sql`DELETE FROM decision_outcomes WHERE day < ${cutoff}::date`;
  return result.count;
}
