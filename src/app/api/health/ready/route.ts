import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { workerStatus } from "@/server/health/worker";
import { pilotStatus } from "@/server/pilot/status";
import { smtpConfigured } from "@/server/config/env";
import { getAdmin } from "@/server/admin/auth";

export const dynamic = "force-dynamic";

/**
 * Readiness for monitoring: database reachable and the worker's journeys job fresh (< 3 min).
 * The status code and `status` are public (load balancers, uptime checks). The detailed
 * checks (heartbeat age, email setup, alert-delivery problems) are shown only to a signed-in
 * moderator — they're operational signals, not something the internet needs to see.
 */
export async function GET() {
  let db = false;
  let worker = { healthy: false, lastBeatAgeSeconds: null as number | null };
  let pilot = false;
  let alertProblems = 0;
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    db = true;
    worker = await workerStatus(sql, systemClock);
    pilot = (await pilotStatus(sql)).available;
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM journeys
      WHERE alert_state IN ('failed', 'unconfirmed') AND missed_at > now() - interval '24 hours'`;
    alertProblems = row.n;
  } catch {
    db = false;
  }
  const ready = db && worker.healthy;
  if (db && !worker.healthy) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "health.worker_stale", ageSeconds: worker.lastBeatAgeSeconds }));
  }
  if (alertProblems > 0) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "health.contact_alert_delivery_problems", count24h: alertProblems }));
  }
  const admin = db ? await getAdmin(getSql(), systemClock).catch(() => null) : null;
  if (!admin) return Response.json({ status: ready ? "ready" : "unavailable" }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
  return Response.json(
    {
      status: ready ? "ready" : "unavailable",
      checks: {
        database: db ? "ok" : "unavailable",
        worker: worker.healthy ? "ok" : "stale",
        workerHeartbeatAgeSeconds: worker.lastBeatAgeSeconds,
        pilotMapData: pilot ? "ok" : "unavailable",
        contactEmail: smtpConfigured() ? (alertProblems > 0 ? "degraded" : "ok") : "not_configured",
        contactAlertProblems24h: alertProblems,
      },
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
