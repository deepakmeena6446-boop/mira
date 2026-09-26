import "server-only";
import type postgres from "postgres";
import { recordArrivalHabit } from "@/server/account/habits";

/**
 * The single place that runs after a journey becomes `arrived` — both "I'm here"
 * (journey/service.ts userAction) and auto-arrival (trips addLocation). It runs AFTER the
 * arrival has committed, so nothing here can undo or delay an arrival: each step is
 * best-effort, isolated, and logged without any personal data.
 *
 * Add one line per step; keep them independent.
 */
export async function onTripArrived(sql: postgres.Sql, journeyId: string, now: Date): Promise<void> {
  await step("habits", () => recordArrivalHabit(sql, journeyId, now)); // Track D: learn from finished journeys to saved places
}

async function step(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.log(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "trip.after_arrival_failed", step: name, error: err instanceof Error ? err.name : "unknown" }));
  }
}
