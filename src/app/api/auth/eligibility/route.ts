import { z } from "zod";
import { cookies } from "next/headers";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { sealAdultAttestation } from "@/server/account/adult-eligibility";
import { cookieName, cookieOptions } from "@/server/session/cookies";

export const dynamic = "force-dynamic";

/** Records only an 18+ self-attestation in a signed, httpOnly cookie; never a birth date. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await readJson(req, z.object({ adult: z.literal(true) }).strict(), 128);
  (await cookies()).set(cookieName("adult"), sealAdultAttestation(), cookieOptions(365 * 24 * 60 * 60));
  return json({ ok: true });
});
