import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { workerStatus } from "@/server/health/worker";
import { pilotStatus } from "@/server/pilot/status";

export const dynamic = "force-dynamic";

/** Readiness: database reachable and worker heartbeat fresh. No secrets or hostnames. */
export async function GET() {
  let db = false;
  let worker = { healthy: false, lastBeatAgeSeconds: null as number | null };
  let pilot = false;
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    db = true;
    worker = await workerStatus(sql, systemClock);
    pilot = (await pilotStatus(sql)).available;
  } catch {
    db = false;
  }
  const ready = db && worker.healthy;
  return Response.json(
    {
      status: ready ? "ready" : "unavailable",
      checks: {
        database: db ? "ok" : "unavailable",
        worker: worker.healthy ? "ok" : "stale",
        workerHeartbeatAgeSeconds: worker.lastBeatAgeSeconds,
        pilotMapData: pilot ? "ok" : "unavailable",
      },
    },
    { status: ready ? 200 : 503 },
  );
}
