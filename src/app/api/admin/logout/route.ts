import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { systemClock } from "@/server/clock";
import { logout } from "@/server/admin/auth";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await logout(getSql(), systemClock);
  return json({ ok: true });
});
