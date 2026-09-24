import { NextResponse, type NextRequest } from "next/server";

/**
 * Sets a Content-Security-Policy per request so the tile origin comes from the
 * runtime MAP_TILE_URL rather than being baked in at build time.
 */
function tileOrigin(): string | null {
  const raw = process.env.MAP_TILE_URL;
  if (!raw) return null;
  try {
    return new URL(raw.replace(/\{[a-z]\}/g, "0")).origin;
  } catch {
    return null;
  }
}

export function proxy(_request: NextRequest) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const dev = process.env.NODE_ENV !== "production";
  const tiles = tileOrigin();
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
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
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", csp);
  if (!dev && (process.env.APP_BASE_URL ?? "").startsWith("https://")) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
