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
    expect(productionWarnings(parseEnv({ ...prod, ...RESEND })).join(" ")).not.toMatch(/No email provider/);
    const providers = { GOOGLE_MAPS_SERVER_KEY: "server", OVERPASS_URL: "https://overpass.example/api", MAPILLARY_TOKEN: "mapillary", ANTHROPIC_API_KEY: "claude" };
    expect(productionWarnings(parseEnv({ ...prod, ...RESEND, ...providers }))).toEqual([]);
    expect(productionWarnings(parseEnv({ ...prod, ...RESEND, ...providers, OVERPASS_URL: undefined })).join(" ")).toMatch(/OpenStreetMap lighting source/);
    expect(productionWarnings(parseEnv(valid))).toEqual([]); // dev/test: quiet
    const missing = { ...prod, PUBLIC_BETA_STRICT: "on" };
    expect(() => parseEnv(missing)).toThrow(/RESEND_API_KEY/);
    const live = { ...missing, ...RESEND, GOOGLE_MAPS_SERVER_KEY: "server", GOOGLE_MAPS_BROWSER_KEY: "browser", AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret", ANTHROPIC_API_KEY: "claude", MAPILLARY_TOKEN: "mapillary", VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:alerts@mira.test", GOOGLE_PLACES_HOURS: "on", PUBLIC_AGGREGATE_RELEASES: "off", OVERPASS_URL: "https://overpass.example/api", CLIENT_IP_HEADER: "x-real-ip" };
    expect(() => parseEnv(live)).not.toThrow();
    expect(() => parseEnv({ ...live, PUBLIC_AGGREGATE_RELEASES: "on" })).toThrow(/PUBLIC_AGGREGATE_RELEASES/);
    expect(() => parseEnv({ ...live, CLIENT_IP_HEADER: undefined })).toThrow(/CLIENT_IP_HEADER/);
    expect(() => parseEnv({ ...live, OVERPASS_URL: undefined })).toThrow(/OVERPASS_URL/);
    expect(() => parseEnv({ ...live, ALLOW_DEMO_SIGNIN: "on" })).toThrow(/ALLOW_DEMO_SIGNIN/);
    expect(() => parseEnv({ ...live, APP_BASE_URL: "http://localhost:3150" })).toThrow(/https/); // a public beta is never plain http
    expect(() => parseEnv({ ...prod, APP_BASE_URL: "http://localhost:3150" })).not.toThrow(); // a local production build may be
  });
  it("logs the warning once, as structured JSON, when the env is first read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { NODE_ENV: "production", APP_BASE_URL: "https://mira.example.org" });
      resetEnvCache();
      getEnv();
      const first = warn.mock.calls.length;
      getEnv();
      expect(first).toBeGreaterThan(0);
      expect(warn).toHaveBeenCalledTimes(first); // once per process, not per read
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

describe("push subscriptions", () => {
  it("accept only the browsers' push services, so the worker never POSTs to a host a user chose", async () => {
    const { isPushServiceUrl } = await import("@/server/providers/notify/push");
    expect(isPushServiceUrl("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushServiceUrl("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushServiceUrl("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushServiceUrl("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isPushServiceUrl("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isPushServiceUrl("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isPushServiceUrl("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushServiceUrl("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushServiceUrl("https://169.254.169.254/latest")).toBe(false);
  });
});

describe("destination names in contacts' emails", () => {
  it("are defused, never refused: a trip must always start", async () => {
    const { placeLabel } = await import("@/server/http/person-name");
    const p = placeLabel(80);
    expect(p.parse("Kamla Nagar Market")).toBe("Kamla Nagar Market");
    expect(p.parse("Café @ Mall")).toBe("Café @ Mall");
    expect(p.parse("Visit https://evil.com/login now")).toBe("Visit evil .com/login now");
    expect(p.parse("www.evil.xyz")).toBe("evil .xyz");
    expect(p.parse("<b>x</b>\nline")).toBe("b x /b line");
    expect(p.parse("<>")).toBe("Destination");
  });
});

describe("failure logs", () => {
  it("keep our own error codes, drop anything that could echo a key or a place, and mask tokens in routes", async () => {
    const { errCode } = await import("@/server/log/err-code");
    const { routeLabel } = await import("@/server/http/handler");
    expect(errCode(new Error("places_403"))).toBe("places_403");
    expect(errCode(new Error("overpass_retry_later"))).toBe("overpass_retry_later");
    expect(errCode(new Error("GET https://maps.googleapis.com/x?key=AIzaSECRET failed"))).toBe("Error");
    expect(errCode(new TypeError("fetch failed"))).toBe("TypeError");
    expect(errCode("nope")).toBe("unknown");
    expect(routeLabel(new Request("https://mira.test/api/t/iiw1Jl-JjX6nX08LM8N_6mDMEC22zPrC"))).toBe("/api/t/:id");
    expect(routeLabel(new Request("https://mira.test/api/trips/5f0c8a52-3d7e-4a55-9a3e-1c2d3e4f5a6b/arrive"))).toBe("/api/trips/:id/arrive");
    expect(routeLabel(new Request("https://mira.test/api/geo/help"))).toBe("/api/geo/help");
    expect(routeLabel(undefined)).toBeNull();
  });
});
