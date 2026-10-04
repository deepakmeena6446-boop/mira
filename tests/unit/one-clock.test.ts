import { describe, expect, it } from "vitest";
import { clockIn } from "@/domain/daylight";

describe("one clock (audit R14: P02-005, P05-006, L05-007)", () => {
  const at = new Date("2026-10-04T15:35:00Z");
  it("is always '9:05 PM' shaped, in the zone asked for, whatever the device locale", () => {
    expect(clockIn(at, "Asia/Kolkata")).toBe("9:05 PM");
    expect(clockIn(at, "Europe/Lisbon")).toBe("4:35 PM");
    expect(clockIn(at.toISOString(), "Asia/Tokyo")).toBe("12:35 AM");
    expect(clockIn(at.getTime(), "Asia/Kolkata")).toBe("9:05 PM");
  });
  it("falls back to the device zone, not a crash, for a bad zone name", () => {
    expect(clockIn(at, "Not/AZone")).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });
});
