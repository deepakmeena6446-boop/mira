import "server-only";
import { getEnv } from "@/server/config/env";
import { ApiError } from "./errors";

/** Custom header every same-origin fetch from the MIRA client sends. */
export const CSRF_HEADER = "x-mira-request";

/**
 * CSRF protection for state-changing cookie-authenticated requests
 * (architecture §4): the Origin must be MIRA's own origin and the request must
 * carry a custom header, which cross-site forms cannot send and cross-origin
 * fetches cannot send without a CORS preflight that MIRA never approves.
 */
export function assertSameOrigin(req: Request): void {
  const expected = new URL(getEnv().APP_BASE_URL).origin;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  const originOk = origin ? origin === expected : site === "same-origin";
  if (!originOk || req.headers.get(CSRF_HEADER) !== "1") {
    throw new ApiError(403, "forbidden_origin", "This request must come from MIRA itself.");
  }
}
