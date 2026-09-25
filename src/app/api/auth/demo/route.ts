import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { providerModes } from "@/server/providers/modes";
import { createDemoUser } from "@/server/account/users";
import { personName } from "@/server/http/person-name";
import { startSession } from "@/server/session/user";
import { forgetActor, getActor } from "@/server/session/actor";
import { claimAnonymousReports } from "@/server/account/users";
import { notifyInApp } from "@/server/providers/notify";

export const dynamic = "force-dynamic";

/** Placeholder for "Continue with Google": creates a real local account with the given name. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  if (providerModes().auth !== "demo") throw notFound();
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
