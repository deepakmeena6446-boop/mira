import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp } from "@/server/ratelimit";
import { systemClock } from "@/server/clock";
import { login } from "@/server/admin/auth";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { password } = await readJson(req, z.object({ password: z.string().min(1).max(256) }).strict(), 2048);
  await login(getSql(), password, clientIp(req), systemClock);
  return json({ ok: true });
});
