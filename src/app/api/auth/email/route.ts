import { assertAdultEligibility } from "@/server/account/adult-eligibility";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { unavailable } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { smtpConfigured } from "@/server/config/env";
import { getUser } from "@/server/session/user";
import { emailHash, emailSchema, requestSignInLink } from "@/server/account/email-auth";

export const dynamic = "force-dynamic";

/**
 * Email a one-time sign-in link. Signed in: adds the email to this account (durable).
 * Signed out: signs in to the account that has this email. The answer is the same either way.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await assertAdultEligibility();
  if (!smtpConfigured()) throw unavailable("email_unavailable", "Email sign-in isn't switched on in this version yet.");
  const sql = getSql();
  const now = new Date();
  const { email } = await readJson(req, emailSchema, 512);
  // Per address, per IP, and for the whole service, so MIRA can't be used to mail-bomb anyone.
  await enforce(sql, [dailyKey("actor", emailHash(email), now)], [{ bucket: "auth:email:addr:h", max: 4, windowMs: 3600_000 }], now);
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "auth:email:ip:h", max: 20, windowMs: 3600_000 }], now);
  await enforce(sql, [dailyKey("global", "signin-mail", now)], [{ bucket: "auth:email:global:h", max: 1000, windowMs: 3600_000 }], now);
  const user = await getUser(sql);
  await requestSignInLink(sql, email, user && !user.durable ? user.id : null);
  return json({ ok: true });
});
