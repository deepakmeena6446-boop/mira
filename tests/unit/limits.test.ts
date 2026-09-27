import { describe, expect, it, beforeEach } from "vitest";
import { ipBucket } from "@/server/ratelimit";
import { resetGoogleBudget, takeGoogleCall } from "@/server/providers/geo/budget";
import { resetEnvCache } from "@/server/config/env";

describe("rate-limit keys", () => {
  it("counts an IPv6 /64 as one client, and leaves IPv4 alone", () => {
    expect(ipBucket("2401:4900:1c2a:8f3e:1111:2222:3333:4444")).toBe("2401:4900:1c2a:8f3e::/64");
    expect(ipBucket("2401:4900:1c2a:8f3e:aaaa::1")).toBe("2401:4900:1c2a:8f3e::/64");
    expect(ipBucket("2401:4900::1")).toBe("2401:4900:0:0::/64");
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:203.0.113.7")).toBe("::ffff:203.0.113.7");
    expect(ipBucket("unknown")).toBe("unknown");
  });
});

describe("Google spend ceiling", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAX_CALLS_PER_MIN = "3";
    resetEnvCache();
    resetGoogleBudget();
  });

  it("allows the budget per minute, then refuses (the adapter falls back to OpenStreetMap), and refills", () => {
    const t = 1_000_000;
    expect([takeGoogleCall(t), takeGoogleCall(t + 1), takeGoogleCall(t + 2), takeGoogleCall(t + 3)]).toEqual([true, true, true, false]);
    expect(takeGoogleCall(t + 60_001)).toBe(true);
    delete process.env.GOOGLE_MAX_CALLS_PER_MIN;
    resetEnvCache();
  });

  it("also stops for the rest of the UTC day at the daily ceiling, then refills the next day", () => {
    process.env.GOOGLE_MAX_CALLS_PER_MIN = "100";
    process.env.GOOGLE_MAX_CALLS_PER_DAY = "4";
    resetEnvCache();
    resetGoogleBudget();
    const warn = console.warn;
    console.warn = () => {};
    try {
      const noon = Date.parse("2026-09-27T12:00:00Z");
      const calls = [0, 61_000, 122_000, 183_000, 244_000, 305_000].map((dt) => takeGoogleCall(noon + dt)); // one per minute
      expect(calls).toEqual([true, true, true, true, false, false]);
      expect(takeGoogleCall(Date.parse("2026-09-28T00:00:01Z"))).toBe(true);
    } finally {
      console.warn = warn;
      delete process.env.GOOGLE_MAX_CALLS_PER_MIN;
      delete process.env.GOOGLE_MAX_CALLS_PER_DAY;
      resetEnvCache();
    }
  });
});
