import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ApiError } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { stopContactEmails, stopTokenEmail } from "@/server/account/contacts";
import { INVITE_IP_LIMITS } from "@/server/journey/http";

export const dynamic = "force-dynamic";

/**
 * "Stop MIRA emails" from an invite or trip email (audit P20-001/P20-002). A POST behind a button, never the link's
 * GET, so a mail scanner opening the link can't opt someone out. Saying stop twice is a harmless no-op.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const now = systemClock.now();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], INVITE_IP_LIMITS, now);
  const { token } = await readJson(req, z.object({ token: z.string().max(700) }).strict(), 1024);
  const email = stopTokenEmail(token);
  if (!email) throw new ApiError(410, "stop_link_invalid", "This link isn't valid. Open the link from the email again.");
  await stopContactEmails(sql, email);
  console.log(JSON.stringify({ t: now.toISOString(), src: "web", event: "contact.emails_stopped" }));
  return json({ status: "stopped" });
});
