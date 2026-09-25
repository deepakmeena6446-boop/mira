import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv, smtpConfigured } from "@/server/config/env";

const valid = { ...process.env } as Record<string, string | undefined>;

describe("environment validation", () => {
  it("accepts the test environment", () => {
    expect(() => parseEnv(valid)).not.toThrow();
  });
  it("names missing variables without echoing secret values", () => {
    try {
      parseEnv({ ...valid, DATA_ENCRYPTION_KEY: "too-short", SESSION_SECRET: undefined });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      const msg = (e as Error).message;
      expect(msg).toContain("DATA_ENCRYPTION_KEY");
      expect(msg).toContain("SESSION_SECRET");
      expect(msg).not.toContain("too-short");
    }
  });
  it("rejects a dotenv-mangled admin hash", () => {
    expect(() => parseEnv({ ...valid, ADMIN_PASSWORD_HASH: "=19=19456,t=2,p=1" })).toThrow(/ADMIN_PASSWORD_HASH/);
  });
  it("requires an https base URL in production except localhost", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production", APP_BASE_URL: "http://mira.example.org" })).toThrow(/https/);
    expect(() => parseEnv({ ...valid, NODE_ENV: "production", APP_BASE_URL: "http://localhost:3100" })).not.toThrow();
  });
  it("derives SMTP capability only from complete configuration", () => {
    expect(smtpConfigured(parseEnv(valid))).toBe(false);
    expect(smtpConfigured(parseEnv({ ...valid, SMTP_HOST: "h", SMTP_FROM: "a@b.c" }))).toBe(true);
  });
});

describe("ADMIN_PASSWORD_HASH b64 form", () => {
  it("decodes the dotenv-safe b64: form to the PHC string", () => {
    const raw = process.env.ADMIN_PASSWORD_HASH!;
    const env = parseEnv({ ...process.env, ADMIN_PASSWORD_HASH: "b64:" + Buffer.from(raw).toString("base64") });
    expect(env.ADMIN_PASSWORD_HASH).toBe(raw);
    expect(() => parseEnv({ ...process.env, ADMIN_PASSWORD_HASH: "b64:" + Buffer.from("nope").toString("base64") })).toThrow(/ADMIN_PASSWORD_HASH/);
  });
});

import { isDefiniteFailure } from "@/server/mail";
describe("SMTP failure classification", () => {
  it("treats pre-DATA failures and 5xx as definite, DATA-stage drops as uncertain", () => {
    expect(isDefiniteFailure({ code: "ESOCKET", command: "CONN" })).toBe(true);
    expect(isDefiniteFailure({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550 })).toBe(true);
    expect(isDefiniteFailure({ code: "ESOCKET", command: "DATA" })).toBe(false);
    expect(isDefiniteFailure({ code: "ETIMEDOUT" })).toBe(false);
    expect(isDefiniteFailure({ responseCode: 451, command: "DATA" })).toBe(false);
  });
});
