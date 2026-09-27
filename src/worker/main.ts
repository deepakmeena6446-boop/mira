/**
 * MIRA background worker: time-based journey processing, retention purges and weekly
 * aggregation. Runs as a separate Node process against the same database.
 */
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
import { createDbHandle } from "@/server/db/client";
import { getEnv } from "@/server/config/env";
import { systemClock } from "@/server/clock";
import { WORKER_STALE_MS, recordHeartbeat } from "@/server/health/worker";
import { JOBS } from "./jobs";
import { workerLog } from "./runner";
import { errCode } from "@/server/log/err-code";

const HEARTBEAT_MS = 30_000;
/** Consecutive heartbeat failures (~5 min) after which the process exits for its supervisor to restart it. */
const MAX_HEARTBEAT_FAILURES = 10;
const TICK_MS = 15_000;
const VERSION = process.env.npm_package_version ?? "0.1.0";

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error });
  const env = getEnv();
  const { sql, ormClient } = createDbHandle(env.DATABASE_URL, 4, { statementTimeoutMs: 30_000 });
  const workerId = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
  const startedAt = systemClock.now();
  const lastRun = new Map<string, number>();
  const running = new Set<string>();
  let stopping = false;

  await sql`SELECT 1`;
  await recordHeartbeat(sql, workerId, startedAt, VERSION, systemClock.now());
  workerLog("worker.started", { workerId, jobs: JOBS.length });

  // Watchdog: alive-but-broken is the worst state for a safety net (nobody gets the missed-arrival
  // email, and nothing restarts us). Exit so the platform supervisor restarts the worker when the
  // journeys job hasn't completed a pass for as long as readiness tolerates, or the DB is gone.
  const lastCompleted = new Map<string, number>();
  let beatFailures = 0;
  const watchdogExit = (reason: string) => {
    workerLog("worker.watchdog_exit", { reason });
    process.exit(1);
  };
  const beat = setInterval(() => {
    recordHeartbeat(sql, workerId, startedAt, VERSION, systemClock.now())
      .then(() => (beatFailures = 0))
      .catch((err) => {
        beatFailures += 1;
        workerLog("worker.heartbeat_failed", { error: errCode(err), consecutive: beatFailures });
        if (beatFailures >= MAX_HEARTBEAT_FAILURES) watchdogExit("heartbeat_failing");
      });
    if (Date.now() - (lastCompleted.get("journeys") ?? startedAt.getTime()) > WORKER_STALE_MS) watchdogExit("journeys_stalled");
  }, HEARTBEAT_MS);

  const tick = async () => {
    for (const job of JOBS) {
      if (stopping || running.has(job.name)) continue;
      const due = (lastRun.get(job.name) ?? 0) + job.intervalMs <= Date.now();
      if (!due) continue;
      running.add(job.name);
      lastRun.set(job.name, Date.now());
      try {
        await job.run({ sql, clock: systemClock, log: workerLog });
        lastCompleted.set(job.name, Date.now());
      } catch (err) {
        // Name/code only: error messages can embed query details.
        const code = (err as { code?: unknown })?.code;
        workerLog("job.failed", { job: job.name, error: errCode(err), code: typeof code === "string" ? code : null });
      } finally {
        running.delete(job.name);
      }
    }
  };
  const loop = setInterval(() => void tick(), TICK_MS);
  void tick();

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    clearInterval(beat);
    clearInterval(loop);
    workerLog("worker.stopping", { signal });
    await sql`DELETE FROM worker_heartbeats WHERE worker_id = ${workerId}`.catch(() => {});
    await Promise.all([sql.end({ timeout: 5 }), ormClient.end({ timeout: 5 })]);
    process.exit(0);
  };
  const fatal = (kind: string) => (err: unknown) => {
    workerLog("worker.fatal", { kind, error: errCode(err) });
    process.exit(1);
  };
  process.on("uncaughtException", fatal("uncaught_exception"));
  process.on("unhandledRejection", fatal("unhandled_rejection"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Worker failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
