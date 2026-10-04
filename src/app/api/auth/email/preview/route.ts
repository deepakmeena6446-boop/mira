import { cookies } from "next/headers";
import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { getEnv, isProduction } from "@/server/config/env";
import { previewSignInLink, signInCookieName } from "@/server/account/email-auth";
import { validAdultAttestation } from "@/server/account/adult-eligibility";
import { cookieName } from "@/server/session/cookies";
import { getUser } from "@/server/session/user";

export const dynamic = "force-dynamic";

/**
 * Before she taps Continue on an emailed sign-in link: which account it opens (masked), whether it would switch this
 * browser away from someone signed in, and whether 18+ still needs confirming here. Never uses the link (audit L01-001).
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "auth:email:preview:ip:h", max: 60, windowMs: 3600_000 }], now);
  const store = await cookies();
  const token = store.get(signInCookieName(isProduction()))?.value ?? "";
  const current = await getUser(sql);
  const preview = await previewSignInLink(sql, token, current?.id ?? null);
  const adultConfirmed = getEnv().NODE_ENV !== "production" || validAdultAttestation(store.get(cookieName("adult"))?.value);
  return json({ valid: Boolean(preview), ...(preview ?? {}), signedInAs: current ? current.name.split(" ")[0] : null, adultConfirmed });
});
