import type { WorkerJob } from "./runner";
import { pruneHeartbeats } from "@/server/health/worker";

/** All periodic jobs. Feature phases register their jobs here. */
export const JOBS: WorkerJob[] = [
  {
    name: "heartbeat-prune",
    intervalMs: 60 * 60_000,
    run: async ({ sql, clock }) => pruneHeartbeats(sql, clock.now()),
  },
];
