import { assertAdultEligibility } from "@/server/account/adult-eligibility";
import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { forbidden } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { demoSignInAllowed } from "@/server/config/env";
import { createDemoUser } from "@/server/account/users";
import { personName } from "@/server/http/person-name";
import { startSession } from "@/server/session/user";
import { forgetActor, getActor } from "@/server/session/actor";
import { claimAnonymousReports } from "@/server/account/users";
import { notifyInApp } from "@/server/providers/notify";

export const dynamic = "force-dynamic";

/**
 * First-name sign-in: a real local account with only the given name, and no way back in once
 * signed out. A fallback only: refused once Google sign-in is configured, unless ALLOW_DEMO_SIGNIN=on.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await assertAdultEligibility();
  if (!demoSignInAllowed()) throw forbidden("Sign in with Google instead.");
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "auth:demo:h", max: 20, windowMs: 3600_000 }], now);
  const { name } = await readJson(req, z.object({ name: personName(40) }).strict(), 1024);
  const userId = await createDemoUser(sql, name);
  await startSession(sql, userId);
  const actor = await getActor();
  const claimed = actor ? await claimAnonymousReports(sql, userId, actor.actorHash) : 0;
  if (actor) await forgetActor(actor);
  await notifyInApp(sql, userId, {
    kind: "welcome",
    title: `Welcome to MIRA, ${name.split(" ")[0]}`,
    body:
      "I'm Mira. Save your home and add someone you trust — then sharing your walk back is one tap." +
      (claimed ? ` The ${claimed === 1 ? "report" : `${claimed} reports`} you sent before signing in ${claimed === 1 ? "is" : "are"} now linked to your account — still private.` : ""),
    href: "/me",
  });
  return json({ ok: true }, 201);
});
