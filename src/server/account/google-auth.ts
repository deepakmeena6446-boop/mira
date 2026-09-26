import "server-only";
import { createHash, createPublicKey, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";
import type postgres from "postgres";
import { encryptText, hmacHex, randomToken } from "@/server/crypto";
import { getEnv } from "@/server/config/env";
import { personName } from "@/server/http/person-name";
import { emailHash } from "./email-auth";
import { deleteAccount } from "./users";

/**
 * Sign in with Google: OpenID Connect authorization code flow with PKCE, no SDK.
 *
 * What MIRA keeps from Google (privacy-minimal, on purpose): the stable account id (`sub`, in
 * auth_accounts), the first name, and the verified email only as the keyed hash + encrypted copy
 * the email-link sign-in already uses — so one person with one address is one account. No picture,
 * no locale, no full name, no Google tokens (the access token is used for nothing and dropped).
 * The email and `sub` are never logged.
 */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
/** The sign-in round trip must finish within this (state cookie lifetime). */
export const GOOGLE_STATE_TTL_S = 600;
/** Clock skew tolerated on `exp` / `iat`. */
const SKEW_S = 60;

export const googleRedirectUri = (base = getEnv().APP_BASE_URL) => new URL("/api/auth/google/callback", base).toString();

/**
 * Where to go after sign-in: a same-origin relative path only. Anything that could leave MIRA
 * (`//host`, `/\host`, a scheme, control characters) falls back to Home.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 512) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const u = new URL(raw, "http://mira.invalid");
    if (u.origin !== "http://mira.invalid") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export interface GoogleState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  /** Issued at (ms), so the server enforces the 10-minute window too. */
  t: number;
}

export function newGoogleState(next: string, now = Date.now()): GoogleState {
  return { state: randomToken(24), nonce: randomToken(24), verifier: randomToken(48), next: safeNext(next), t: now };
}

/** The state cookie value: payload + keyed MAC, so it can't be edited (e.g. a forged `next`). */
export function sealState(s: GoogleState): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${hmacHex("google-oauth-state", body)}`;
}

export function openState(value: string | undefined, now = Date.now()): GoogleState | null {
  if (!value || value.length > 2048) return null;
  const [body, mac, extra] = value.split(".");
  if (!body || !mac || extra !== undefined || !safeEqual(mac, hmacHex("google-oauth-state", body))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleState;
    if (typeof s.state !== "string" || typeof s.nonce !== "string" || typeof s.verifier !== "string" || typeof s.t !== "number") return null;
    if (now - s.t > GOOGLE_STATE_TTL_S * 1000 || s.t - now > SKEW_S * 1000) return null;
    return { ...s, next: safeNext(s.next) };
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

export function authorizationUrl(p: { clientId: string; redirectUri: string; state: string; nonce: string; verifier: string }): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    nonce: p.nonce,
    code_challenge: pkceChallenge(p.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

// --- ID token verification ---------------------------------------------------

type Jwk = JsonWebKey & { kid?: string; kty?: string; alg?: string; use?: string };
let jwksCache: { keys: Jwk[]; expires: number; fetched: number } | null = null;

/** Test hook. */
export function resetGoogleJwksCache(): void {
  jwksCache = null;
}

async function googleKeys(kid: string, now: number): Promise<Jwk | null> {
  const hit = jwksCache && jwksCache.expires > now ? jwksCache.keys.find((k) => k.kid === kid) : undefined;
  if (hit) return hit;
  // Unknown kid: Google rotated keys. Refetch, but never more than once a minute.
  if (jwksCache && now - jwksCache.fetched < 60_000 && jwksCache.expires > now) return null;
  const res = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new GoogleAuthError("jwks_unavailable");
  const body = (await res.json()) as { keys?: Jwk[] };
  if (!Array.isArray(body.keys)) throw new GoogleAuthError("jwks_invalid");
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  jwksCache = { keys: body.keys, fetched: now, expires: now + Math.min(Math.max(maxAge, 60), 86_400) * 1000 };
  return body.keys.find((k) => k.kid === kid) ?? null;
}

/** A failed step, by a short reason code (safe to log: never carries token contents). */
export class GoogleAuthError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "GoogleAuthError";
  }
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  firstName: string;
}

/**
 * First name only: `given_name`, else the first word of `name`, else a neutral placeholder she can
 * change. It must pass the same rule as a typed name (it appears in emails to her people, so no
 * links or addresses dressed up as a name).
 */
export function firstNameFrom(given: unknown, name: unknown): string {
  const clean = (v: unknown) => {
    if (typeof v !== "string") return "";
    const first = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
    return personName(40).safeParse(first).success ? first : "";
  };
  return clean(given) || clean(name) || "Friend";
}

const b64json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

/** Verify a Google ID token (RS256 against Google's JWKS) and the claims MIRA relies on. */
export async function verifyIdToken(idToken: string, expect: { clientId: string; nonce: string }, now = Date.now()): Promise<GoogleIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3 || idToken.length > 8192) throw new GoogleAuthError("token_malformed");
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try {
    header = b64json(parts[0]);
    claims = b64json(parts[1]);
  } catch {
    throw new GoogleAuthError("token_malformed");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new GoogleAuthError("token_alg");
  const jwk = await googleKeys(header.kid, now);
  if (!jwk || jwk.kty !== "RSA") throw new GoogleAuthError("token_kid");
  let ok = false;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
  } catch {
    ok = false;
  }
  if (!ok) throw new GoogleAuthError("token_signature");

  const sec = Math.floor(now / 1000);
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw new GoogleAuthError("token_iss");
  const aud = claims.aud;
  const audOk = aud === expect.clientId || (Array.isArray(aud) && aud.includes(expect.clientId) && claims.azp === expect.clientId);
  if (!audOk) throw new GoogleAuthError("token_aud");
  if (typeof claims.exp !== "number" || claims.exp + SKEW_S < sec) throw new GoogleAuthError("token_expired");
  if (typeof claims.iat !== "number" || claims.iat - SKEW_S > sec) throw new GoogleAuthError("token_iat");
  if (typeof claims.nonce !== "string" || !safeEqual(claims.nonce, expect.nonce)) throw new GoogleAuthError("token_nonce");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new GoogleAuthError("token_sub");
  if (typeof claims.email !== "string" || !claims.email.includes("@") || claims.email.length > 254) throw new GoogleAuthError("email_missing");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new GoogleAuthError("email_unverified");
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), firstName: firstNameFrom(claims.given_name, claims.name) };
}

/** Swap the one-time code for tokens (server to server, with the client secret and PKCE verifier). */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const env = getEnv();
  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) throw new GoogleAuthError("not_configured");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: env.AUTH_GOOGLE_ID,
      client_secret: env.AUTH_GOOGLE_SECRET,
      redirect_uri: googleRedirectUri(env.APP_BASE_URL),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new GoogleAuthError(`token_http_${res.status}`);
  const body = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!body || typeof body.id_token !== "string") throw new GoogleAuthError("token_missing");
  return body.id_token;
}

// --- Account linking -----------------------------------------------------------

export type GoogleSignIn = { userId: string; how: "returning" | "linked_email" | "upgraded" | "created"; discardedDemo: boolean };

/**
 * Which account a verified Google identity signs into, in order:
 * (a) the account already linked to this Google id;
 * (b) the account that already has this verified email (email-link sign-in) — Google is linked to it;
 * (c) the first-name account she's signed into right now — upgraded in place (places, contacts, trips kept);
 * (d) a new account.
 * If (a) or (b) wins while she's signed into a different first-name account, that account is deleted:
 * it can never be signed back into (the existing demo sign-out rule). Durable accounts are never deleted here.
 */
export async function signInWithGoogle(sql: postgres.Sql, id: GoogleIdentity, current: { id: string; durable: boolean } | null): Promise<GoogleSignIn> {
  const hash = emailHash(id.email);
  const enc = encryptText(id.email, "user_email");
  const r = await sql.begin(async (tx) => {
    const [linked] = await tx<{ user_id: string }[]>`SELECT user_id FROM auth_accounts WHERE provider = 'google' AND provider_user_id = ${id.sub}`;
    if (linked) return { userId: linked.user_id, how: "returning" as const };
    const [byEmail] = await tx<{ id: string }[]>`SELECT id FROM users WHERE email_hash = ${hash}`;
    if (byEmail) {
      await tx`INSERT INTO auth_accounts (provider, provider_user_id, user_id) VALUES ('google', ${id.sub}, ${byEmail.id})`;
      return { userId: byEmail.id, how: "linked_email" as const };
    }
    if (current && !current.durable) {
      const [u] = await tx<{ id: string }[]>`
        UPDATE users SET email_hash = ${hash}, email_enc = ${enc} WHERE id = ${current.id} AND email_hash IS NULL RETURNING id`;
      if (u) {
        await tx`INSERT INTO auth_accounts (provider, provider_user_id, user_id) VALUES ('google', ${id.sub}, ${u.id})`;
        // No longer a first-name-only account: signing out keeps it now.
        await tx`DELETE FROM auth_accounts WHERE user_id = ${u.id} AND provider = 'demo'`;
        return { userId: u.id, how: "upgraded" as const };
      }
    }
    const [u] = await tx<{ id: string }[]>`INSERT INTO users (name, email_hash, email_enc) VALUES (${id.firstName}, ${hash}, ${enc}) RETURNING id`;
    await tx`INSERT INTO auth_accounts (provider, provider_user_id, user_id) VALUES ('google', ${id.sub}, ${u.id})`;
    return { userId: u.id, how: "created" as const };
  });
  let discardedDemo = false;
  if (current && current.id !== r.userId && !current.durable) {
    const [demo] = await sql`SELECT 1 FROM auth_accounts WHERE user_id = ${current.id} AND provider = 'demo'`;
    if (demo) {
      await deleteAccount(sql, current.id);
      discardedDemo = true;
    }
  }
  return { ...r, discardedDemo };
}
