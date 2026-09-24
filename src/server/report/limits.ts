import type { Limit } from "@/server/ratelimit";

/**
 * Operational abuse thresholds. Restricted: these values are not shown in the app
 * (product spec §9). Tuning them does not change any product behaviour or copy.
 */
export const REPORT_LIMITS_ACTOR: Limit[] = [
  { bucket: "report:actor:h", max: 5, windowMs: 3600_000 },
  { bucket: "report:actor:d", max: 15, windowMs: 86_400_000 },
];
export const REPORT_LIMITS_IP: Limit[] = [
  { bucket: "report:ip:h", max: 15, windowMs: 3600_000 },
  { bucket: "report:ip:d", max: 40, windowMs: 86_400_000 },
];
/** Distinct actors reporting the same cell + category within the burst window. */
export const BURST_WINDOW_MS = 2 * 3600_000;
export const BURST_DISTINCT_ACTORS = 8;
export const REPORT_RETENTION_DAYS = 30;
