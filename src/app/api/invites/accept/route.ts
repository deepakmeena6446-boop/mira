import { cookies } from "next/headers";
import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ApiError } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { acceptInvite } from "@/server/journey/invites";
import { acceptContactInvite } from "@/server/account/contacts";
import { inviteCookieName } from "@/server/journey/invite-cookie";
import { INVITE_IP_LIMITS } from "@/server/journey/http";

export const dynamic = "force-dynamic";

/** Accept the one-journey alert invitation held in the invite cookie. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], INVITE_IP_LIMITS, now);
  const token = (await cookies()).get(inviteCookieName())?.value;
  if (!token) throw new ApiError(410, "invite_invalid", "This invitation link has expired. Open the link from the email again.");
  if (await acceptContactInvite(sql, token)) return json({ status: "accepted" });
  const status = await acceptInvite(sql, token, now);
  return json({ status });
});
