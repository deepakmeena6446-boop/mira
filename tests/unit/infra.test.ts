import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EnvValidationError,
  emailConfigured,
  emailProvider,
  emailSenderAddress,
  getEnv,
  parseEnv,
  productionWarnings,
  resetEnvCache,
  smtpConfigured,
} from "@/server/config/env";
import { contentSecurityPolicy, hstsHeader } from "@/server/http/security-headers";
import { clientIp } from "@/server/ratelimit";
import { waitForDatabase } from "../../scripts/migrate";

const valid = { ...process.env } as Record<string, string | undefined>;
const RESEND = { RESEND_API_KEY: "re_x", EMAIL_FROM: "MIRA <alerts@mira.test>" };

describe("email provider detection", () => {
  it("prefers Resend, falls back to SMTP, else none", () => {
    expect(emailProvider(parseEnv(valid))).toBe("none");
    expect(emailProvider(parseEnv({ ...valid, ...RESEND }))).toBe("resend");
    expect(emailProvider(parseEnv({ ...valid, SMTP_HOST: "h", SMTP_FROM: "a@b.c" }))).toBe("smtp");
    expect(emailProvider(parseEnv({ ...valid, SMTP_HOST: "h", EMAIL_FROM: "a@b.c" }))).toBe("smtp");
    expect(emailProvider(parseEnv({ ...valid, ...RESEND, SMTP_HOST: "h", SMTP_FROM: "a@b.c" }))).toBe("resend");
  });
  it("emailConfigured answers for any provider, and smtpConfigured is the same function", () => {
    expect(emailConfigured(parseEnv(valid))).toBe(false);
    expect(emailConfigured(parseEnv({ ...valid, ...RESEND }))).toBe(true);
    expect(smtpConfigured).toBe(emailConfigured);
    expect(smtpConfigured(parseEnv({ ...valid, ...RESEND }))).toBe(true);
  });
  it("requires a sender for Resend and validates its shape", () => {
    expect(() => parseEnv({ ...valid, RESEND_API_KEY: "re_x" })).toThrow(/EMAIL_FROM/);
    expect(() => parseEnv({ ...valid, ...RESEND, EMAIL_FROM: "not an address" })).toThrow(/EMAIL_FROM/);
    expect(() => parseEnv({ ...valid, ...RESEND, EMAIL_FROM: "alerts@mira.test" })).not.toThrow();
    expect(() => parseEnv({ ...valid, SMTP_HOST: "h" })).toThrow(/SMTP_FROM/);
  });
  it("exposes the bare sender address for the anti-spam hint", () => {
    expect(emailSenderAddress(parseEnv({ ...valid, ...RESEND }))).toBe("alerts@mira.test");
    expect(emailSenderAddress(parseEnv({ ...valid, SMTP_HOST: "h", SMTP_FROM: "no-reply@mira.test" }))).toBe("no-reply@mira.test");
    expect(emailSenderAddress(parseEnv(valid))).toBeNull();
  });
  it("never echoes the key in validation errors", () => {
    try {
      parseEnv({ ...valid, RESEND_API_KEY: "re_super_secret" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      expect((e as Error).message).not.toContain("re_super_secret");
    }
  });
});

describe("production validation", () => {
  const prod = { ...valid, NODE_ENV: "production", APP_BASE_URL: "https://mira.example.org" };
  afterEach(() => {
    resetEnvCache();
  });

  it("fails when only half of the Google OAuth client is set", () => {
    expect(() => parseEnv({ ...valid, AUTH_GOOGLE_ID: "id" })).toThrow(/AUTH_GOOGLE_SECRET/);
    expect(() => parseEnv({ ...valid, AUTH_GOOGLE_SECRET: "s" })).toThrow(/AUTH_GOOGLE_ID/);
    expect(() => parseEnv({ ...valid, AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" })).not.toThrow();
  });
  it("boots without email in production but warns loudly (share-link-only beta)", () => {
    expect(() => parseEnv(prod)).not.toThrow();
    expect(productionWarnings(parseEnv(prod)).join(" ")).toMatch(/No email provider/);
    expect(productionWarnings(parseEnv({ ...prod, ...RESEND }))).toEqual([]);
    expect(productionWarnings(parseEnv(valid))).toEqual([]); // dev/test: quiet
  });
  it("logs the warning once, as structured JSON, when the env is first read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { NODE_ENV: "production", APP_BASE_URL: "https://mira.example.org" });
      resetEnvCache();
      getEnv();
      getEnv();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ src: "config", event: "config.warning" });
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
      warn.mockRestore();
    }
  });
  it("rejects nonsense proxy settings", () => {
    expect(() => parseEnv({ ...valid, TRUSTED_PROXY_HOPS: "0" })).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => parseEnv({ ...valid, CLIENT_IP_HEADER: "x real ip" })).toThrow(/CLIENT_IP_HEADER/);
    expect(() => parseEnv({ ...valid, TRUSTED_PROXY_HOPS: "2", CLIENT_IP_HEADER: "x-real-ip" })).not.toThrow();
  });
});

describe("security headers", () => {
  it("sends HSTS only for a production build on https", () => {
    expect(hstsHeader({ NODE_ENV: "production", APP_BASE_URL: "https://mira.example.org" })).toBe("max-age=31536000; includeSubDomains");
    expect(hstsHeader({ NODE_ENV: "production", APP_BASE_URL: "http://localhost:3100" })).toBeNull(); // E2E
    expect(hstsHeader({ NODE_ENV: "development", APP_BASE_URL: "https://mira.example.org" })).toBeNull();
  });
  it("allows Google tiles when the browser key is set, and the Google consent redirect only with OAuth on", () => {
    const base = { NODE_ENV: "production", MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/positron" };
    const plain = contentSecurityPolicy("n0nce", base);
    expect(plain).toContain("script-src 'self' 'nonce-n0nce' 'strict-dynamic'");
    expect(plain).not.toContain("unsafe-eval");
    expect(plain).not.toContain("googleapis");
    expect(plain).toMatch(/form-action 'self';/);
    const google = contentSecurityPolicy("n0nce", { ...base, GOOGLE_MAPS_BROWSER_KEY: "k", AUTH_GOOGLE_ID: "id" });
    expect(google).toMatch(/img-src [^;]*https:\/\/tile\.googleapis\.com/);
    expect(google).toMatch(/connect-src [^;]*https:\/\/tile\.googleapis\.com/);
    expect(google).toContain("form-action 'self' https://accounts.google.com");
    expect(google).not.toContain("k;"); // the key itself never appears
  });
  it("includes the night style's origin", () => {
    const csp = contentSecurityPolicy("n", { NODE_ENV: "production", MAP_STYLE_URL_NIGHT: "https://night.example.org/style.json" });
    expect(csp).toMatch(/connect-src [^;]*https:\/\/night\.example\.org/);
  });
});

describe("client IP behind Railway's edge", () => {
  afterEach(() => {
    delete process.env.CLIENT_IP_HEADER;
    delete process.env.TRUSTED_PROXY_HOPS;
  });
  const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

  it("uses the trusted single header when configured, ignoring a forged X-Forwarded-For", () => {
    process.env.CLIENT_IP_HEADER = "x-real-ip";
    expect(clientIp(req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4, 100.64.0.2" }))).toBe("203.0.113.9");
  });
  it("falls back to X-Forwarded-For hops when the header is missing or unset", () => {
    process.env.CLIENT_IP_HEADER = "x-real-ip";
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 198.51.100.7" }))).toBe("198.51.100.7");
    delete process.env.CLIENT_IP_HEADER;
    expect(clientIp(req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4, 198.51.100.7" }))).toBe("198.51.100.7");
  });
});

describe("production migrations", () => {
  it("waits for the database, then gives up with the driver error (no deploy hangs forever)", { timeout: 20_000 }, async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(waitForDatabase("postgres://u:p@127.0.0.1:1/none", 2, 10)).rejects.toMatchObject({ code: "ECONNREFUSED" });
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0][0])).not.toContain("u:p");
    } finally {
      log.mockRestore();
    }
  });
});
