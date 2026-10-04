import { assertAdultEligibility } from "@/server/account/adult-eligibility";
import { cookies } from "next/headers";
import { getSql } from "@/server/db/client";
import { z } from "zod";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ApiError } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { isProduction } from "@/server/config/env";
import { consumeSignInLink, previewSignInLink, signInCookieName } from "@/server/account/email-auth";
import { endSession, getUser, startSession } from "@/server/session/user";

export const dynamic = "force-dynamic";

const body = z.object({ switchAccount: z.boolean().optional() }).strict();

/**
 * Use the sign-in link held in the short-lived cookie (a tap, so mail scanners can't use it). The link is checked
 * before the 18+ rule, so an expired or wrong link says so (audit P19-001). A link for another account than the one
 * signed in here needs her explicit switch, after the page has named both (audit L01-001: login CSRF).
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { switchAccount = false } = await readJson(req, body, 256);
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "auth:email:confirm:ip:h", max: 30, windowMs: 3600_000 }], now);
  const store = await cookies();
  const token = store.get(signInCookieName(isProduction()))?.value;
  const current = await getUser(sql);
  const preview = token ? await previewSignInLink(sql, token, current?.id ?? null) : null;
  if (preview?.switching && !switchAccount) throw new ApiError(409, "switch_needed", "This link signs in to a different account than the one open here. Review it before switching.");
  if (preview) await assertAdultEligibility();
  store.delete(signInCookieName(isProduction()));
  const r = token ? await consumeSignInLink(sql, token, current?.id ?? null) : null;
  if (!r) {
    console.warn(JSON.stringify({ t: now.toISOString(), src: "web", event: "auth.email_link_invalid" }));
    throw new ApiError(410, "link_invalid", "This sign-in link has expired or was already used. Ask for a new one.");
  }
  if ("error" in r) {
    console.warn(JSON.stringify({ t: now.toISOString(), src: "web", event: "auth.email_link_other_account" }));
    throw new ApiError(409, "link_other_account", "Open this link in the browser where you asked to add your email, while signed in to MIRA there. Ask for a new link if needed.");
  }
  if (current?.id !== r.userId) {
    await endSession(sql);
    await startSession(sql, r.userId);
  }
  return json({ ok: true, added: r.added });
});
