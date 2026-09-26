import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { recordHeartbeat } from "@/server/health/worker";
import { encryptText, hashToken, randomToken } from "@/server/crypto";
import { emailHash } from "@/server/account/email-auth";
import { GOOGLE_JWKS_URL, GOOGLE_TOKEN_URL, openState, pkceChallenge, resetGoogleJwksCache } from "@/server/account/google-auth";
import { GET as startGET } from "@/app/api/auth/google/start/route";
import { GET as callbackGET } from "@/app/api/auth/google/callback/route";
import { GET as optionsGET } from "@/app/api/auth/options/route";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as signoutPOST } from "@/app/api/auth/signout/route";
import { GET as meGET, DELETE as meDELETE } from "@/app/api/me/route";
import { GET as placesGET, POST as placesPOST } from "@/app/api/me/places/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { GET as sharedGET } from "@/app/api/t/[token]/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar, type Jar } from "../helpers/cookie-jar";
import { getRequest, jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const BASE = "http://localhost:3100";
const FAILED = `${BASE}/?signin=failed`;
const HOME = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };

// A test-only RSA key pair stands in for Google's signing key; fetch is stubbed (offline).
const google = generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid-1";
const jwk = { ...google.publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

function idToken(claims: Record<string, unknown>, key: KeyObject = google.privateKey, kid = KID): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc(claims);
  return `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url")}`;
}

let nextIdToken = "";
const tokenCalls: URLSearchParams[] = [];
const realFetch = globalThis.fetch;
const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url === GOOGLE_JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
  if (url === GOOGLE_TOKEN_URL) {
    tokenCalls.push(new URLSearchParams(String(init?.body)));
    return new Response(JSON.stringify({ access_token: "unused", id_token: nextIdToken, token_type: "Bearer", expires_in: 3599 }), { headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
});

const uniq = () => randomUUID().slice(0, 8);
const nowS = () => Math.floor(Date.now() / 1000);
function claimsFor(p: { sub: string; email: string; nonce: string }, extra: Record<string, unknown> = {}) {
  return { iss: "https://accounts.google.com", aud: CLIENT_ID, azp: CLIENT_ID, iat: nowS(), exp: nowS() + 3600, email_verified: true, given_name: "Ana", name: "Ana Maria Lopez", picture: "https://lh3.googleusercontent.com/a/photo", locale: "es", ...p, ...extra };
}

/**
 * One full round trip in `jar`: start → (Google) → callback. `make` builds the ID token Google
 * would return, given the nonce the start route sent. Returns the callback response.
 */
async function roundTrip(jar: Jar, make: (nonce: string) => string, opts: { next?: string; state?: (s: string) => string; query?: string } = {}) {
  switchJar(jar);
  const start = await startGET(getRequest(`/api/auth/google/start?next=${encodeURIComponent(opts.next ?? "/")}`));
  expect(start.status).toBe(302);
  const to = new URL(start.headers.get("location")!);
  const state = to.searchParams.get("state")!;
  nextIdToken = make(to.searchParams.get("nonce")!);
  const q = opts.query ?? `state=${encodeURIComponent(opts.state ? opts.state(state) : state)}&code=${randomToken(16)}&scope=openid`;
  return callbackGET(getRequest(`/api/auth/google/callback?${q}`));
}
const signInGoogle = (jar: Jar, sub: string, email: string, extra: Record<string, unknown> = {}, next?: string) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub, email, nonce }, extra)), { next });

async function demo(name: string): Promise<Jar> {
  const jar = newJar();
  switchJar(jar);
  expect((await demoPOST(jsonRequest("/api/auth/demo", { name }))).status).toBe(201);
  return jar;
}
async function me(jar: Jar) {
  switchJar(jar);
  return (await (await meGET()).json()).user as { id: string; name: string; durable: boolean; avatarUrl: string | null } | null;
}
const userCount = async () => (await getSql()<{ n: number }[]>`SELECT count(*)::int AS n FROM users`)[0].n;
function withGoogle(extra: Record<string, string | undefined> = {}) {
  applyTestEnv({ AUTH_GOOGLE_ID: CLIENT_ID, AUTH_GOOGLE_SECRET: "test-only-secret", ...extra });
  resetEnvCache();
}

describe("Sign in with Google (OIDC code + PKCE, offline)", () => {
  beforeAll(async () => {
    vi.stubGlobal("fetch", fakeFetch);
    await loadFixturePilot(getSql());
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    applyTestEnv();
    resetEnvCache();
  });
  beforeEach(async () => {
    withGoogle();
    resetGoogleJwksCache();
    tokenCalls.length = 0;
    await getSql()`DELETE FROM abuse_counters`;
  });
  afterEach(() => vi.restoreAllMocks());

  it("start: sealed short-lived state cookie, then Google with state, nonce, S256 challenge and the exact redirect URI", async () => {
    const jar = newJar();
    switchJar(jar);
    const res = await startGET(getRequest("/api/auth/google/start?next=%2Fcircle%3Fx%3D1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = Object.fromEntries(to.searchParams);
    expect(p).toMatchObject({ client_id: CLIENT_ID, redirect_uri: `${BASE}/api/auth/google/callback`, response_type: "code", scope: "openid email profile", code_challenge_method: "S256", prompt: "select_account" });
    expect(p.state.length).toBeGreaterThanOrEqual(32);
    expect(p.nonce.length).toBeGreaterThanOrEqual(32);
    const sealed = jar.get("mira_google");
    expect(sealed).toBeTruthy();
    const s = openState(sealed)!;
    expect(s).toMatchObject({ state: p.state, nonce: p.nonce, next: "/circle?x=1" });
    expect(p.code_challenge).toBe(pkceChallenge(s.verifier));
    expect(to.toString()).not.toContain(s.verifier); // the verifier never leaves the server
    // `next` is kept only as a path on MIRA.
    for (const bad of ["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "evil"]) {
      await startGET(getRequest(`/api/auth/google/start?next=${encodeURIComponent(bad)}`));
      expect(openState(jar.get("mira_google"))!.next).toBe("/");
    }
  });

  it("first sign-in creates an account with the first name only; the second reuses it", async () => {
    const sub = `g-${uniq()}`;
    const email = `Ana.${uniq()}@Example.test`;
    const logs: string[] = [];
    for (const m of ["info", "warn", "error", "log"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
    const jar = newJar();
    const res = await signInGoogle(jar, sub, email, {}, "/me");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/me`);
    expect(jar.has("mira_google")).toBe(false); // state cookie is single use
    const u = (await me(jar))!;
    expect(u).toMatchObject({ name: "Ana", durable: true, avatarUrl: null });
    const [row] = await getSql()`SELECT name, email, avatar_url, email_hash, email_enc FROM users WHERE id = ${u.id}`;
    expect(row).toMatchObject({ name: "Ana", email: null, avatar_url: null, email_hash: emailHash(email) });
    expect(row.email_enc).not.toContain("@");
    expect(await getSql()`SELECT provider, provider_user_id FROM auth_accounts WHERE user_id = ${u.id}`).toEqual([{ provider: "google", provider_user_id: sub }]);
    // The code exchange is server to server with the secret, the PKCE verifier and the same redirect URI.
    expect(Object.fromEntries(tokenCalls[0])).toMatchObject({ client_id: CLIENT_ID, client_secret: "test-only-secret", grant_type: "authorization_code", redirect_uri: `${BASE}/api/auth/google/callback` });
    expect(tokenCalls[0].get("code_verifier")!.length).toBeGreaterThanOrEqual(43);
    // Never logged: the email, the Google id, the name.
    expect(logs.join("\n")).toMatch(/auth\.google_signed_in/);
    expect(logs.join("\n").toLowerCase()).not.toMatch(new RegExp(`${sub}|${email.toLowerCase().replace(/\./g, "\\.")}|ana maria`));

    const before = await userCount();
    const again = newJar();
    await signInGoogle(again, sub, email, { given_name: "Anita" });
    expect((await me(again))!.id).toBe(u.id);
    expect(await userCount()).toBe(before);
    expect((await me(again))!.name).toBe("Ana"); // her name isn't overwritten on each sign-in
  });

  it("no given_name: the first word of the name, never the full name", async () => {
    const jar = newJar();
    await signInGoogle(jar, `g-${uniq()}`, `${uniq()}@example.test`, { given_name: undefined, name: "Zara Ahmed Khan" });
    expect((await me(jar))!.name).toBe("Zara");
  });

  it("links Google to an existing email-link account with the same verified address", async () => {
    const email = `lee-${uniq()}@example.test`;
    const [existing] = await getSql()<{ id: string }[]>`
      INSERT INTO users (name, email_hash, email_enc) VALUES ('Lee', ${emailHash(email)}, ${encryptText(email, "user_email")}) RETURNING id`;
    await getSql()`INSERT INTO auth_accounts (provider, provider_user_id, user_id) VALUES ('email', ${emailHash(email)}, ${existing.id})`;
    const before = await userCount();
    const jar = newJar();
    await signInGoogle(jar, `g-${uniq()}`, email.toUpperCase());
    expect((await me(jar))!.id).toBe(existing.id);
    expect(await userCount()).toBe(before);
    expect((await getSql()`SELECT provider FROM auth_accounts WHERE user_id = ${existing.id} ORDER BY provider`).map((r) => r.provider)).toEqual(["email", "google"]);
  });

  it("a signed-in first-name account is upgraded in place (keeps her places), and its anonymous pseudonym is dropped", async () => {
    withGoogle({ ALLOW_DEMO_SIGNIN: "on" });
    const jar = await demo("Mia");
    const demoUser = (await me(jar))!;
    expect(demoUser.durable).toBe(false);
    expect((await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }))).status).toBe(201);
    // An anonymous pseudonym from before signing in.
    const actorToken = randomToken(32);
    await getSql()`INSERT INTO actor_sessions (token_hash, expires_at) VALUES (${hashToken("actor", actorToken)}, ${new Date(Date.now() + 86_400_000)})`;
    jar.set("mira_actor", actorToken);
    const oldSession = jar.get("mira_session");

    await signInGoogle(jar, `g-${uniq()}`, `mia-${uniq()}@example.test`, { given_name: "Mia" });
    const u = (await me(jar))!;
    expect(u).toMatchObject({ id: demoUser.id, name: "Mia", durable: true });
    expect(jar.get("mira_session")).not.toBe(oldSession); // session rotated on sign-in
    expect(await getSql()`SELECT 1 FROM user_sessions WHERE token_hash = ${hashToken("admin", `user:${oldSession}`)}`).toHaveLength(0);
    switchJar(jar);
    expect((await (await placesGET()).json()).places.map((p: { label: string }) => p.label)).toEqual(["Home"]);
    expect((await getSql()`SELECT provider FROM auth_accounts WHERE user_id = ${u.id}`).map((r) => r.provider)).toEqual(["google"]);
    expect(jar.has("mira_actor")).toBe(false);
    expect(await getSql()`SELECT 1 FROM actor_sessions WHERE token_hash = ${hashToken("actor", actorToken)}`).toHaveLength(0);
    // Durable now: signing out keeps the account.
    expect(await (await signoutPOST(jsonRequest("/api/auth/signout", {}))).json()).toMatchObject({ ok: true, deleted: false });
    expect(await getSql()`SELECT 1 FROM users WHERE id = ${u.id}`).toHaveLength(1);
  });

  it("signing into an existing Google account from a different first-name account deletes that throwaway account", async () => {
    const sub = `g-${uniq()}`;
    const email = `sam-${uniq()}@example.test`;
    const first = newJar();
    await signInGoogle(first, sub, email, { given_name: "Sam" });
    const samId = (await me(first))!.id;

    withGoogle({ ALLOW_DEMO_SIGNIN: "on" });
    const jar = await demo("Zoe");
    const zoeId = (await me(jar))!.id;
    await signInGoogle(jar, sub, email);
    expect((await me(jar))!.id).toBe(samId);
    expect(await getSql()`SELECT 1 FROM users WHERE id = ${zoeId}`).toHaveLength(0);
    // A durable account is never deleted by signing into another one.
    const other = newJar();
    await signInGoogle(other, `g-${uniq()}`, `kai-${uniq()}@example.test`);
    const kaiId = (await me(other))!.id;
    await signInGoogle(other, sub, email);
    expect((await me(other))!.id).toBe(samId);
    expect(await getSql()`SELECT 1 FROM users WHERE id = ${kaiId}`).toHaveLength(1);
  });

  it("keeps a first-name account with places and contacts when Google belongs to another account", async () => {
    const sub = `g-${uniq()}`;
    const email = `existing-${uniq()}@example.test`;
    const existing = newJar();
    await signInGoogle(existing, sub, email);
    const existingId = (await me(existing))!.id;

    withGoogle({ ALLOW_DEMO_SIGNIN: "on" });
    const jar = await demo("Ria");
    const demoId = (await me(jar))!.id;
    switchJar(jar);
    expect((await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }))).status).toBe(201);
    await getSql()`INSERT INTO contacts (user_id, name, encrypted_email, email_hash, accepted_at)
      VALUES (${demoId}, 'Mum', ${encryptText(`mum-${uniq()}@example.test`, "contact_email")}, ${emailHash(`unique-${uniq()}@example.test`)}, now())`;
    const session = jar.get("mira_session");
    const res = await signInGoogle(jar, sub, email);
    expect(res.headers.get("location")).toBe(`${BASE}/me?switch=preserved`);
    expect(jar.get("mira_session")).toBe(session);
    expect((await me(jar))!.id).toBe(demoId);
    expect(await getSql()`SELECT 1 FROM saved_places WHERE user_id = ${demoId}`).toHaveLength(1);
    expect(await getSql()`SELECT 1 FROM contacts WHERE user_id = ${demoId}`).toHaveLength(1);
    expect(await getSql()`SELECT 1 FROM users WHERE id = ${existingId}`).toHaveLength(1);
  });

  describe("every failure lands on Home with ?signin=failed and no session", () => {
    const cases: Array<[string, (jar: Jar) => Promise<Response>, string]> = [
      ["bad state", (jar) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce })), { state: () => randomToken(24) }), "state_mismatch"],
      ["bad nonce", (jar) => roundTrip(jar, () => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce: randomToken(24) }))), "token_nonce"],
      ["wrong aud", (jar) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce }, { aud: "someone-else.apps.googleusercontent.com", azp: "someone-else" }))), "token_aud"],
      ["wrong iss", (jar) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce }, { iss: "https://evil.example" }))), "token_iss"],
      ["expired token", (jar) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce }, { iat: nowS() - 7200, exp: nowS() - 3600 }))), "token_expired"],
      ["unverified email", (jar) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce }, { email_verified: false }))), "email_unverified"],
      ["bad signature", (jar) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce }), stranger.privateKey)), "token_signature"],
      ["unknown key id", (jar) => roundTrip(jar, (nonce) => idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce }), google.privateKey, "other-kid")), "token_kid"],
      ["alg none", (jar) => roundTrip(jar, (nonce) => `${Buffer.from(JSON.stringify({ alg: "none", kid: KID })).toString("base64url")}.${Buffer.from(JSON.stringify(claimsFor({ sub: "x", email: "x@example.test", nonce }))).toString("base64url")}.`), "token_alg"],
      ["she cancelled at Google", (jar) => roundTrip(jar, () => "", { query: "error=access_denied" }), "denied"],
      [
        "no state cookie",
        async (jar) => {
          switchJar(jar);
          return callbackGET(getRequest(`/api/auth/google/callback?state=${randomToken(24)}&code=abc`));
        },
        "state_missing",
      ],
    ];
    for (const [name, run, reason] of cases) {
      it(name, async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const before = await userCount();
        const jar = newJar();
        const res = await run(jar);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(FAILED);
        expect(jar.has("mira_session")).toBe(false);
        expect(jar.has("mira_google")).toBe(false);
        expect(await userCount()).toBe(before);
        expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])))).toContainEqual(expect.objectContaining({ event: "auth.google_failed", reason }));
      });
    }

    it("a callback can't be replayed (the state cookie is used once)", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const jar = newJar();
      switchJar(jar);
      const start = await startGET(getRequest("/api/auth/google/start"));
      const to = new URL(start.headers.get("location")!);
      nextIdToken = idToken(claimsFor({ sub: `g-${uniq()}`, email: `${uniq()}@example.test`, nonce: to.searchParams.get("nonce")! }));
      const url = `/api/auth/google/callback?state=${to.searchParams.get("state")}&code=abc`;
      expect((await callbackGET(getRequest(url))).headers.get("location")).toBe(`${BASE}/`);
      expect(jar.has("mira_google")).toBe(false);
      // The same callback URL again (back button, a leaked link): no state cookie any more.
      const session = jar.get("mira_session");
      expect((await callbackGET(getRequest(url))).headers.get("location")).toBe(FAILED);
      expect(jar.get("mira_session")).toBe(session);
      expect(tokenCalls).toHaveLength(1); // the code was never sent to Google twice
    });

    it("without Google configured, start and callback both fail closed", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      applyTestEnv();
      resetEnvCache();
      const jar = newJar();
      switchJar(jar);
      expect((await startGET(getRequest("/api/auth/google/start"))).headers.get("location")).toBe(FAILED);
      expect(jar.has("mira_google")).toBe(false);
      expect((await callbackGET(getRequest("/api/auth/google/callback?state=a&code=b"))).headers.get("location")).toBe(FAILED);
    });
  });

  it("first-name sign-in is a fallback: refused once Google is configured, unless ALLOW_DEMO_SIGNIN=on", async () => {
    switchJar(newJar());
    const res = await demoPOST(jsonRequest("/api/auth/demo", { name: "Nia" }));
    expect(res.status).toBe(403);
    expect(await (await optionsGET()).json()).toEqual({ google: true, email: false, demo: false });

    withGoogle({ ALLOW_DEMO_SIGNIN: "on" });
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Nia" }))).status).toBe(201);
    expect(await (await optionsGET()).json()).toEqual({ google: true, email: false, demo: true });

    applyTestEnv();
    resetEnvCache();
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Nia" }))).status).toBe(201);
    expect(await (await optionsGET()).json()).toEqual({ google: false, email: false, demo: true });
  });

  it("deleting the account removes its Google link too (FK cascade)", async () => {
    const sub = `g-${uniq()}`;
    const jar = newJar();
    await signInGoogle(jar, sub, `del-${uniq()}@example.test`);
    const id = (await me(jar))!.id;
    switchJar(jar);
    expect((await meDELETE(jsonRequest("/api/me", {}, { method: "DELETE" }))).status).toBe(200);
    expect(await getSql()`SELECT 1 FROM auth_accounts WHERE provider = 'google' AND provider_user_id = ${sub}`).toHaveLength(0);
    expect(await getSql()`SELECT 1 FROM users WHERE id = ${id}`).toHaveLength(0);
    expect(await me(jar)).toBeNull();
  });

  it("a shared journey link works with no cookie and no account at all", async () => {
    applyTestEnv();
    resetEnvCache();
    await recordHeartbeat(getSql(), "google-auth-worker", new Date(), "test", new Date());
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
    await demo("Ira");
    const r = await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, share: false }));
    expect(r.status).toBe(201);
    const token = (await r.json()).trip.shareUrl.split("/t/")[1];
    const empty = newJar();
    switchJar(empty);
    const res = await sharedGET(getRequest(`/api/t/${token}`), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ state: "active", name: "Ira" });
    expect(empty.size).toBe(0); // viewing sets no cookie
  });
});
