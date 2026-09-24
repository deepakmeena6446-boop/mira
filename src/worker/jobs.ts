import type { WorkerJob } from "./runner";
import { pruneHeartbeats } from "@/server/health/worker";
import { purgeExpired } from "@/server/retention";
import { runWeeklyAggregation } from "@/server/aggregate/run";

/** All periodic jobs. Each is idempotent and safe to run concurrently with the web app. */
export const JOBS: WorkerJob[] = [
  {
    name: "heartbeat-prune",
    intervalMs: 60 * 60_000,
    run: async ({ sql, clock }) => pruneHeartbeats(sql, clock.now()),
  },
  {
    name: "retention-purge",
    intervalMs: 5 * 60_000,
    run: async ({ sql, clock, log }) => {
      const counts = await purgeExpired(sql, clock.now());
      if (Object.values(counts).some((n) => n > 0)) log("retention.purged", counts);
    },
  },
  {
    // Checks every 10 minutes; releases at most once per IST Monday (idempotent).
    name: "weekly-aggregation",
    intervalMs: 10 * 60_000,
    run: async ({ sql, clock, log }) => {
      const r = await runWeeklyAggregation(sql, clock);
      if (r.ran) log("aggregation.released", { week: r.releaseWeek, keys: r.keysEvaluated, releases: r.releasesCreated, burstHeld: r.heldForBurst });
    },
  },
];
