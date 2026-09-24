import "server-only";
import { cookies } from "next/headers";
import { getSql } from "@/server/db/client";
import { hashToken, randomToken } from "@/server/crypto";
import { cookieName, cookieOptions } from "./cookies";

/**
 * Pseudonymous browser ownership (architecture §3). No profile, no recovery.
 * The cookie is created only by the first stateful action (a POST), never by a
 * passive page load. `actorHash` is the keyed hash stored alongside owned rows.
 */
export const ACTOR_TTL_DAYS = 30;

export interface Actor {
  id: string;
  actorHash: string;
}

export async function getActor(): Promise<Actor | null> {
  const store = await cookies();
  const token = store.get(cookieName("actor"))?.value;
  if (!token || token.length > 128) return null;
  const tokenHash = hashToken("actor", token);
  const [row] = await getSql()<{ id: string }[]>`
    SELECT id FROM actor_sessions WHERE token_hash = ${tokenHash} AND expires_at > now()`;
  return row ? { id: row.id, actorHash: tokenHash } : null;
}

/** Returns the current actor or creates one and sets the cookie. Call only from POST handlers. */
export async function ensureActor(): Promise<Actor> {
  const existing = await getActor();
  if (existing) return existing;
  const token = randomToken(32);
  const tokenHash = hashToken("actor", token);
  const expires = new Date(Date.now() + ACTOR_TTL_DAYS * 86_400_000);
  const [row] = await getSql()<{ id: string }[]>`
    INSERT INTO actor_sessions (token_hash, expires_at) VALUES (${tokenHash}, ${expires}) RETURNING id`;
  const store = await cookies();
  store.set(cookieName("actor"), token, cookieOptions(ACTOR_TTL_DAYS * 86_400));
  return { id: row.id, actorHash: tokenHash };
}
