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
import { recordHeartbeat } from "@/server/health/worker";
import { JOBS } from "./jobs";
import { workerLog } from "./runner";

const HEARTBEAT_MS = 30_000;
const TICK_MS = 15_000;
const VERSION = process.env.npm_package_version ?? "0.1.0";

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error });
  const env = getEnv();
  const { sql, ormClient } = createDbHandle(env.DATABASE_URL, 4);
  const workerId = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
  const startedAt = systemClock.now();
  const lastRun = new Map<string, number>();
  const running = new Set<string>();
  let stopping = false;

  await sql`SELECT 1`;
  await recordHeartbeat(sql, workerId, startedAt, VERSION, systemClock.now());
  workerLog("worker.started", { workerId, jobs: JOBS.length });

  const beat = setInterval(() => {
    recordHeartbeat(sql, workerId, startedAt, VERSION, systemClock.now()).catch((err) =>
      workerLog("worker.heartbeat_failed", { error: err instanceof Error ? err.name : "unknown" }),
    );
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
      } catch (err) {
        // Name/code only: error messages can embed query details.
        const code = (err as { code?: unknown })?.code;
        workerLog("job.failed", { job: job.name, error: err instanceof Error ? err.name : "unknown", code: typeof code === "string" ? code : null });
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
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Worker failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
