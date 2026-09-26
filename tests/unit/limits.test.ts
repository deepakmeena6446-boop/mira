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
});
