/**
 * Validates required configuration when the Next.js server starts, so a missing or
 * malformed secret fails loudly at boot instead of at the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/server/config/env");
    getEnv();
  }
}
