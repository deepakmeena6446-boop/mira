import { NextResponse } from "next/server";
import { getEnv, isProduction } from "@/server/config/env";
import { COOKIE_MAX_AGE, signInCookieName } from "@/server/account/email-auth";

export const dynamic = "force-dynamic";

/** Move the sign-in token out of the URL into a short-lived cookie, then show a clean confirm page. */
export async function GET(_req: Request, ctx: RouteContext<"/auth/link/[token]">) {
  const { token } = await ctx.params;
  // The configured origin, never the request's Host header (links in emails always use APP_BASE_URL).
  const res = NextResponse.redirect(new URL("/auth/link", getEnv().APP_BASE_URL), 303);
  if (/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
    res.cookies.set(signInCookieName(isProduction()), token, { httpOnly: true, secure: isProduction(), sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE });
  }
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
