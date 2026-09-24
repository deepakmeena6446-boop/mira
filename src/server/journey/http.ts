import "server-only";
import type { Limit } from "@/server/ratelimit";

/** Operational limits (restricted; not shown in the UI). */
export const JOURNEY_CREATE_LIMITS: Limit[] = [
  { bucket: "journey:create:h", max: 10, windowMs: 3600_000 },
];
export const JOURNEY_IP_LIMITS: Limit[] = [{ bucket: "journey:ip:m", max: 60, windowMs: 60_000 }];
export const INVITE_IP_LIMITS: Limit[] = [{ bucket: "invite:ip:h", max: 30, windowMs: 3600_000 }];
