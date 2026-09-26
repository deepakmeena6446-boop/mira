import { describe, expect, it } from "vitest";
import { authorizationUrl, firstNameFrom, newGoogleState, openState, pkceChallenge, safeNext, sealState, GOOGLE_STATE_TTL_S } from "@/server/account/google-auth";
import { demoSignInAllowed, googleSignInConfigured, parseEnv } from "@/server/config/env";

describe("safeNext: only a path on MIRA survives", () => {
  it.each([
    ["/", "/"],
    ["/me", "/me"],
    ["/circle?tab=people#x", "/circle?tab=people#x"],
    ["/a/../me", "/me"],
  ])("keeps %s", (input, out) => expect(safeNext(input)).toBe(out));
  it.each([null, undefined, "", "me", "//evil.example", "///evil.example", "/\\evil.example", "\\\\evil.example", "https://evil.example/", "javascript:alert(1)", "/\u0000x", "/\nx", `/${"a".repeat(600)}`])(
    "rejects %j",
    (input) => expect(safeNext(input)).toBe("/"),
  );
});

describe("PKCE and the authorization URL", () => {
  it("S256 challenge matches RFC 7636 appendix B", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("asks for openid email profile with select_account, and never carries the verifier", () => {
    const u = new URL(authorizationUrl({ clientId: "cid", redirectUri: "https://mira.example.org/api/auth/google/callback", state: "s", nonce: "n", verifier: "v".repeat(64) }));
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid",
      redirect_uri: "https://mira.example.org/api/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      state: "s",
      nonce: "n",
      code_challenge: pkceChallenge("v".repeat(64)),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });
});

describe("sealed state cookie", () => {
  it("round-trips, and refuses edits, other MACs and old cookies", () => {
    const now = Date.now();
    const s = newGoogleState("/me", now);
    const sealed = sealState(s);
    expect(openState(sealed, now + 1000)).toEqual(s);
    const [body, mac] = sealed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...s, next: "//evil.example" })).toString("base64url");
    expect(openState(`${forged}.${mac}`, now)).toBeNull();
    expect(openState(`${body}.${"0".repeat(64)}`, now)).toBeNull();
    expect(openState(`${body}`, now)).toBeNull();
    expect(openState(undefined, now)).toBeNull();
    expect(openState(sealed, now + GOOGLE_STATE_TTL_S * 1000 + 1)).toBeNull();
  });
  it("fresh randomness each time", () => {
    const a = newGoogleState("/");
    const b = newGoogleState("/");
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43); // RFC 7636: 43–128 characters
  });
});

describe("first name only", () => {
  it.each([
    ["Ana", "Ana Maria Lopez", "Ana"],
    [undefined, "Zara Ahmed Khan", "Zara"],
    ["  Mei Ling ", undefined, "Mei"],
    ["<b>Bo</b>", "Bo Chen", "Bo"],
    ["evil.com", undefined, "Friend"],
    ["https://x.example", "Kim Lee", "Kim"],
    [undefined, undefined, "Friend"],
    ["", "", "Friend"],
  ])("given %j, name %j → %j", (given, name, out) => expect(firstNameFrom(given, name)).toBe(out));
  it("is at most 40 characters", () => expect(firstNameFrom("x".repeat(80), undefined)).toHaveLength(40));
});

describe("which sign-in is on", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@h/db",
    APP_BASE_URL: "http://localhost:3100",
    SESSION_SECRET: Buffer.alloc(32, 1).toString("base64"),
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo",
    PILOT_MANIFEST_PATH: "x.json",
    MAP_TILE_URL: "https://t/{z}/{x}/{y}.png",
  };
  it("no Google: first name allowed", () => {
    const env = parseEnv(base);
    expect(googleSignInConfigured(env)).toBe(false);
    expect(demoSignInAllowed(env)).toBe(true);
  });
  it("half a Google client isn't configured", () => {
    expect(googleSignInConfigured(parseEnv({ ...base, AUTH_GOOGLE_ID: "id" }))).toBe(false);
  });
  it("Google: first name off unless ALLOW_DEMO_SIGNIN=on", () => {
    const g = { ...base, AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret" };
    expect(googleSignInConfigured(parseEnv(g))).toBe(true);
    expect(demoSignInAllowed(parseEnv(g))).toBe(false);
    expect(demoSignInAllowed(parseEnv({ ...g, ALLOW_DEMO_SIGNIN: "off" }))).toBe(false);
    expect(demoSignInAllowed(parseEnv({ ...g, ALLOW_DEMO_SIGNIN: "on" }))).toBe(true);
    expect(() => parseEnv({ ...g, ALLOW_DEMO_SIGNIN: "yes" })).toThrow(/ALLOW_DEMO_SIGNIN/);
  });
});
