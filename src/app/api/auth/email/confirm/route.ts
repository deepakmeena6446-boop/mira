import { assertAdultEligibility } from "@/server/account/adult-eligibility";
import { cookies } from "next/headers";
import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ApiError } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { isProduction } from "@/server/config/env";
import { consumeSignInLink, signInCookieName } from "@/server/account/email-auth";
import { endSession, getUser, startSession } from "@/server/session/user";

export const dynamic = "force-dynamic";

/** Use the sign-in link held in the short-lived cookie (a tap, so mail scanners can't use it). */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await assertAdultEligibility();
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "auth:email:confirm:ip:h", max: 30, windowMs: 3600_000 }], now);
  const store = await cookies();
  const token = store.get(signInCookieName(isProduction()))?.value;
  store.delete(signInCookieName(isProduction()));
  const r = token ? await consumeSignInLink(sql, token) : null;
  if (!r) throw new ApiError(410, "link_invalid", "This sign-in link has expired or was already used. Ask for a new one.");
  const current = await getUser(sql);
  if (current?.id !== r.userId) {
    await endSession(sql);
    await startSession(sql, r.userId);
  }
  return json({ ok: true, added: r.added });
});
