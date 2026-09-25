import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { notFound } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { providerModes } from "@/server/providers/modes";
import { createDemoUser } from "@/server/account/users";
import { startSession } from "@/server/session/user";

export const dynamic = "force-dynamic";

/** Placeholder for "Continue with Google": creates a real local account with the given name. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  if (providerModes().auth !== "demo") throw notFound();
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "auth:demo:h", max: 20, windowMs: 3600_000 }], now);
  const { name } = await readJson(req, z.object({ name: z.string().trim().min(1).max(40) }).strict(), 1024);
  const userId = await createDemoUser(sql, name);
  await startSession(sql, userId);
  return json({ ok: true }, 201);
});
