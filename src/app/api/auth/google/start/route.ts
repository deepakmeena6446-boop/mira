import { cookies } from "next/headers";
import { getEnv, googleSignInConfigured } from "@/server/config/env";
import { cookieName, cookieOptions } from "@/server/session/cookies";
import { authorizationUrl, GOOGLE_STATE_TTL_S, googleRedirectUri, newGoogleState, sealState } from "@/server/account/google-auth";

export const dynamic = "force-dynamic";

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store", "referrer-policy": "no-referrer" } });

/**
 * Begin "Continue with Google": a top-level navigation. State, nonce and the PKCE verifier live
 * only in a sealed, httpOnly, 10-minute cookie; `next` is kept only if it's a path on MIRA.
 */
export async function GET(req: Request) {
  const env = getEnv();
  if (!googleSignInConfigured(env)) return redirect(new URL("/?signin=failed", env.APP_BASE_URL).toString());
  const s = newGoogleState(new URL(req.url).searchParams.get("next") ?? "/");
  (await cookies()).set(cookieName("google"), sealState(s), cookieOptions(GOOGLE_STATE_TTL_S));
  return redirect(authorizationUrl({ clientId: env.AUTH_GOOGLE_ID!, redirectUri: googleRedirectUri(env.APP_BASE_URL), state: s.state, nonce: s.nonce, verifier: s.verifier }));
}
