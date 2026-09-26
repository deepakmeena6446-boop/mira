import "server-only";
import type postgres from "postgres";
import { smtpConfigured } from "@/server/config/env";
import type { Clock } from "@/server/clock";
import { workerStatus } from "./worker";

/**
 * Whether a missed-arrival alert would actually go out right now: the worker that sends it
 * must be running, and email must be configured. Shown to the traveller during a journey so
 * the app never implies a safety net that isn't there (a silent failure is the worst case).
 */
export interface SafetyNet {
  worker: boolean;
  email: boolean;
}

export async function safetyNet(sql: postgres.Sql, clock: Clock): Promise<SafetyNet> {
  const worker = await workerStatus(sql, clock).catch(() => ({ healthy: false }));
  return { worker: worker.healthy, email: smtpConfigured() };
}
