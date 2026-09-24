import type postgres from "postgres";
import type { Clock } from "@/server/clock";

/** A periodic worker job. Jobs must be idempotent and safe to run concurrently. */
export interface WorkerJob {
  name: string;
  intervalMs: number;
  run(ctx: JobContext): Promise<void>;
}

export interface JobContext {
  sql: postgres.Sql;
  clock: Clock;
  log: (event: string, fields?: Record<string, string | number | boolean | null>) => void;
}

/**
 * Structured worker log. Only IDs, counts and state names may be logged — never
 * narratives, contact addresses, coordinates or tokens.
 */
export function workerLog(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), src: "worker", event, ...fields }));
}
