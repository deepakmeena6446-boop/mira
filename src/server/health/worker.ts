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

export async function workerStatus(sql: postgres.Sql, clock: Clock): Promise<WorkerStatus> {
  const [row] = await sql<{ last: Date | null }[]>`SELECT max(last_beat_at) AS last FROM worker_heartbeats`;
  if (!row?.last) return { healthy: false, lastBeatAgeSeconds: null };
  const age = clock.now().getTime() - new Date(row.last).getTime();
  return { healthy: age >= -60_000 && age <= WORKER_STALE_MS, lastBeatAgeSeconds: Math.max(0, Math.round(age / 1000)) };
}

/** Drop heartbeat rows from long-dead worker instances. */
export async function pruneHeartbeats(sql: postgres.Sql, now: Date): Promise<void> {
  await sql`DELETE FROM worker_heartbeats WHERE last_beat_at < ${new Date(now.getTime() - 24 * 3600_000)}`;
}
