import type postgres from "postgres";
import type { Clock } from "@/server/clock";

/** Readiness fails when the newest heartbeat is older than this (architecture §6). */
export const WORKER_STALE_MS = 3 * 60_000;

export async function recordHeartbeat(
  sql: postgres.Sql,
  workerId: string,
  startedAt: Date,
  version: string,
  now: Date,
): Promise<void> {
  await sql`
    INSERT INTO worker_heartbeats (worker_id, started_at, last_beat_at, version)
    VALUES (${workerId}, ${startedAt}, ${now}, ${version})
    ON CONFLICT (worker_id) DO UPDATE SET last_beat_at = EXCLUDED.last_beat_at, version = EXCLUDED.version`;
}

export interface WorkerStatus {
  healthy: boolean;
  lastBeatAgeSeconds: number | null;
}

/**
 * Healthy only when a worker process is alive AND the journeys job completed a pass
 * recently ("job:journeys" row). A worker that runs but keeps failing is not healthy —
 * trips must not start when nobody would send their missed-arrival alert.
 */
export async function workerStatus(sql: postgres.Sql, clock: Clock): Promise<WorkerStatus> {
  const [row] = await sql<{ proc: Date | null; job: Date | null }[]>`
    SELECT max(last_beat_at) FILTER (WHERE worker_id NOT LIKE 'job:%') AS proc,
           max(last_beat_at) FILTER (WHERE worker_id = 'job:journeys') AS job
    FROM worker_heartbeats`;
  if (!row?.proc) return { healthy: false, lastBeatAgeSeconds: null };
  const now = clock.now().getTime();
  const fresh = (d: Date | null) => d !== null && now - new Date(d).getTime() >= -60_000 && now - new Date(d).getTime() <= WORKER_STALE_MS;
  const age = now - new Date(row.proc).getTime();
  return { healthy: fresh(row.proc) && fresh(row.job), lastBeatAgeSeconds: Math.max(0, Math.round(age / 1000)) };
}

/** Drop heartbeat rows from long-dead worker instances. */
export async function pruneHeartbeats(sql: postgres.Sql, now: Date): Promise<void> {
  await sql`DELETE FROM worker_heartbeats WHERE last_beat_at < ${new Date(now.getTime() - 24 * 3600_000)}`;
}
