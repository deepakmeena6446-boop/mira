/**
 * Per-request security headers set by `src/proxy.ts`. Kept here (not in the proxy file, which
 * must export only `proxy` and `config`) so they can be unit-tested. Reads plain env values:
 * no secrets, and no `getEnv()` so a config error can't take the whole proxy down.
 */
type Env = Record<string, string | undefined>;

function tileOrigins(env: Env): string | null {
  const origins = [env.MAP_TILE_URL, env.MAP_STYLE_URL, env.MAP_STYLE_URL_NIGHT, env.GOOGLE_MAPS_BROWSER_KEY ? "https://tile.googleapis.com" : undefined]
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

/**
 * A fresh script nonce every request (no inline script runs unless Next.js or our layout stamped
 * it), and the map origins from the runtime MAP_* settings rather than baked in at build time.
 */
export function contentSecurityPolicy(nonce: string, env: Env = process.env): string {
  const dev = env.NODE_ENV !== "production";
  const tiles = tileOrigins(env);
  return [
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
    // Browsers apply form-action to the redirects that follow a form POST, so a sign-in *form* that
    // redirects to Google's consent screen needs its origin here. A plain link/GET needs nothing.
    `form-action 'self'${env.AUTH_GOOGLE_ID ? " https://accounts.google.com" : ""}`,
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * HSTS only for a production build served on https: the E2E suite runs NODE_ENV=production on
 * http://localhost, where HSTS would pin localhost to https for the whole browser.
 */
export function hstsHeader(env: Env = process.env): string | null {
  if (env.NODE_ENV !== "production") return null;
  if (!(env.APP_BASE_URL ?? "").startsWith("https://")) return null;
  return "max-age=31536000; includeSubDomains";
}
