import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, hstsHeader } from "@/server/http/security-headers";

/**
 * Sets a Content-Security-Policy per request (fresh script nonce, runtime map origins) and,
 * for a production https origin, HSTS. Policy details: src/server/http/security-headers.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header and stamps its own scripts with it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  const hsts = hstsHeader();
  if (hsts) res.headers.set("Strict-Transport-Security", hsts);
  return res;
}

export const config = {
  // offline.html is a static file with its own fixed policy (next.config.ts); it can't carry a per-request nonce.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|offline.html).*)"],
};
