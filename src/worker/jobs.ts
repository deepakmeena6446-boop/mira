import type { WorkerJob } from "./runner";
import { pruneHeartbeats } from "@/server/health/worker";
import { purgeExpired } from "@/server/retention";

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
];
