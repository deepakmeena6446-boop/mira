import { NextResponse, type NextRequest } from "next/server";

/**
 * Sets a Content-Security-Policy per request: a fresh script nonce every time (no inline
 * scripts run unless Next.js or our layout stamped them with it), and the map origins
 * from the runtime MAP_* settings rather than baked in at build time.
 */
function tileOrigin(): string | null {
  const origins = [process.env.MAP_TILE_URL, process.env.MAP_STYLE_URL, process.env.GOOGLE_MAPS_BROWSER_KEY ? "https://tile.googleapis.com" : undefined]
    .filter((v): v is string => Boolean(v))
    .map((raw) => {
      try {
        return new URL(raw.replace(/\{[a-z]\}/g, "0")).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return origins.length ? [...new Set(origins)].join(" ") : null;
}

export function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const tiles = tileOrigin();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    // Only scripts carrying this request's nonce (and what they load) may run: an injected <script> can't.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline *styles* stay allowed: React style attributes need it, and styles can't run code.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${tiles ? ` ${tiles}` : ""}`,
    `connect-src 'self'${tiles ? ` ${tiles}` : ""}${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  // Next.js reads the nonce from the request's CSP header and stamps its own scripts with it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  if (!dev && (process.env.APP_BASE_URL ?? "").startsWith("https://")) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
}

export const config = {
  // offline.html is a static file with its own fixed policy (next.config.ts); it can't carry a per-request nonce.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|offline.html).*)"],
};
