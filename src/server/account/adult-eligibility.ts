import "server-only";
import { cookies } from "next/headers";
import { getEnv } from "@/server/config/env";
import { hmacHex, safeEqualHex } from "@/server/crypto";
import { forbidden } from "@/server/http/errors";
import { cookieName } from "@/server/session/cookies";

const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** A signed self-attestation, with no date of birth or identity document collected. */
export function sealAdultAttestation(now = Date.now()): string {
  const issued = Math.floor(now / 1000);
  return `v1.${issued}.${hmacHex("adult-attestation", String(issued))}`;
}

export function validAdultAttestation(value: string | undefined, now = Date.now()): boolean {
  const match = /^v1\.(\d{10})\.([0-9a-f]{64})$/.exec(value ?? "");
  if (!match) return false;
  const issued = Number(match[1]);
  const age = Math.floor(now / 1000) - issued;
  return age >= 0 && age <= MAX_AGE_SECONDS && safeEqualHex(match[2], hmacHex("adult-attestation", match[1]));
}

/** Production sign-in paths must have the self-attestation before account creation or switch. */
export async function assertAdultEligibility(): Promise<void> {
  if (getEnv().NODE_ENV !== "production") return;
  const value = (await cookies()).get(cookieName("adult"))?.value;
  if (!validAdultAttestation(value)) throw forbidden("Confirm that you are 18 or older before signing in.");
}
