import { NextResponse } from "next/server";
import { getEnv, isProduction } from "@/server/config/env";
import { INVITE_COOKIE_MAX_AGE, inviteCookieName } from "@/server/journey/invite-cookie";

export const dynamic = "force-dynamic";

/**
 * Token landing (architecture §6): move the bearer token out of the URL into a
 * short-lived HttpOnly cookie and redirect to the clean /invite page before anything
 * renders. No lookups or third-party requests happen on this URL.
 */
export async function GET(_req: Request, ctx: RouteContext<"/invite/[token]">) {
  const { token } = await ctx.params;
  // The configured origin, never the request's Host header (links in emails always use APP_BASE_URL).
  const res = NextResponse.redirect(new URL("/invite", getEnv().APP_BASE_URL), 303);
  if (/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
    res.cookies.set(inviteCookieName(), token, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
      path: "/",
      maxAge: INVITE_COOKIE_MAX_AGE,
    });
  }
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
