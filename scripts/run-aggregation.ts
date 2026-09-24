/**
 * Operator tool: run the weekly aggregation now for the IST Monday given by --at
 * (defaults to the current time). Refuses non-Monday times, and is idempotent per week
 * exactly like the worker job.
 *   npm run aggregate:run -- --at 2026-09-28T02:00:00Z
 */
import postgres from "postgres";
import { loadProjectEnv } from "./load-env";
import { runWeeklyAggregation } from "../src/server/aggregate/run";
import { isIstMonday } from "../src/domain/time-bands";

async function main() {
  loadProjectEnv();
  const i = process.argv.indexOf("--at");
  const at = i > 0 ? new Date(process.argv[i + 1]) : new Date();
  if (Number.isNaN(at.getTime())) throw new Error("--at must be an ISO timestamp");
  if (!isIstMonday(at)) throw new Error("Releases happen on Mondays (IST) only; pass a Monday timestamp with --at.");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    console.log(await runWeeklyAggregation(sql, { now: () => at }));
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Aggregation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
