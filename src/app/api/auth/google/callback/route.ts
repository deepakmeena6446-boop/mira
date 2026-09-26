import { assertAdultEligibility } from "@/server/account/adult-eligibility";
import { cookies } from "next/headers";
import { getSql } from "@/server/db/client";
import { getEnv, googleSignInConfigured } from "@/server/config/env";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { cookieName } from "@/server/session/cookies";
import { getUser, startSession } from "@/server/session/user";
import { forgetActor, getActor } from "@/server/session/actor";
import { claimAnonymousReports } from "@/server/account/users";
import { exchangeCode, GoogleAuthError, openState, safeEqual, signInWithGoogle, verifyIdToken } from "@/server/account/google-auth";
import { notifyInApp } from "@/server/providers/notify";

export const dynamic = "force-dynamic";

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store", "referrer-policy": "no-referrer" } });

/** One line per attempt: outcome and a short reason code only (never the email, `sub` or tokens). */
function log(event: string, extra: Record<string, unknown>) {
  console[event === "auth.google_failed" ? "warn" : "info"](JSON.stringify({ t: new Date().toISOString(), src: "web", event, ...extra }));
}

/**
 * Google sends her back here with a one-time code. A GET top-level navigation, so it's protected by
 * the state (compared in constant time to the sealed cookie), the nonce inside the signed ID token,
 * and PKCE — not by the same-origin header check the POST routes use. Any failure lands on Home
 * with `?signin=failed` and no session; the reason goes to the log only.
 */
export async function GET(req: Request) {
  const base = getEnv().APP_BASE_URL;
  const failed = () => redirect(new URL("/?signin=failed", base).toString());
  const store = await cookies();
  const sealed = store.get(cookieName("google"))?.value;
  store.delete(cookieName("google")); // single use, whatever happens next
  try {
    await assertAdultEligibility();
    if (!googleSignInConfigured()) throw new GoogleAuthError("not_configured");
    const sql = getSql();
    const now = new Date();
    await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "auth:google:ip:h", max: 30, windowMs: 3600_000 }], now);
    const q = new URL(req.url).searchParams;
    if (q.get("error")) throw new GoogleAuthError(q.get("error") === "access_denied" ? "denied" : "provider_error");
    const s = openState(sealed, now.getTime());
    if (!s) throw new GoogleAuthError("state_missing");
    const state = q.get("state") ?? "";
    const code = q.get("code") ?? "";
    if (!safeEqual(state, s.state)) throw new GoogleAuthError("state_mismatch");
    if (!code || code.length > 2048) throw new GoogleAuthError("code_missing");

    const identity = await verifyIdToken(await exchangeCode(code, s.verifier), { clientId: getEnv().AUTH_GOOGLE_ID!, nonce: s.nonce });
    const current = await getUser(sql);
    const r = await signInWithGoogle(sql, identity, current ? { id: current.id, durable: current.durable } : null);
    await startSession(sql, r.userId); // rotates: any earlier session in this browser ends first
    const actor = await getActor();
    const claimed = actor ? await claimAnonymousReports(sql, r.userId, actor.actorHash) : 0;
    if (actor) await forgetActor(actor);
    if (r.how === "created") {
      await notifyInApp(sql, r.userId, {
        kind: "welcome",
        title: `Welcome to MIRA, ${identity.firstName}`,
        body:
          "I'm Mira. Save your home and add someone you trust — then sharing your journey is one tap." +
          (claimed ? ` The ${claimed === 1 ? "report" : `${claimed} reports`} you sent before signing in ${claimed === 1 ? "is" : "are"} now linked to your account — still private.` : ""),
        href: "/me",
      });
    }
    log("auth.google_signed_in", { how: r.how, discardedDemo: r.discardedDemo, claimed });
    return redirect(new URL(s.next, base).toString());
  } catch (err) {
    const reason = err instanceof GoogleAuthError ? err.reason : (err as { code?: unknown })?.code === "rate_limited" ? "rate_limited" : err instanceof Error ? err.name : "unknown";
    log("auth.google_failed", { reason });
    if (reason === "demo_data_preserved") return redirect(new URL("/me?switch=preserved", base).toString());
    return failed();
  }
}
