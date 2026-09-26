import { describe, expect, it } from "vitest";
import {
  TRAVEL_MODES,
  TRAVEL_MODE_INFO,
  TRIP_ETA_MAX,
  TRIP_ETA_MIN,
  distanceUnits,
  expectedMinutes,
  formatDistance,
  formatMinutes,
  isTravelMode,
  travelLine,
} from "@/domain/travel-mode";
import { startTripSchema } from "@/server/trips";

const FROM = { lat: 51.5074, lon: -0.1278 };

describe("travel modes", () => {
  it("has three global modes with global labels (never one country's words)", () => {
    expect(TRAVEL_MODES).toEqual(["walk", "ride", "transit"]);
    expect(TRAVEL_MODES.map((m) => TRAVEL_MODE_INFO[m].label)).toEqual(["Walk", "Ride / car", "Transit"]);
    expect(JSON.stringify(TRAVEL_MODE_INFO)).not.toMatch(/\b(auto|metro|cab|safe|unsafe|safest)\b/i);
  });

  it("gives lighting and along-the-way context to walks only; rides and transit get Help Points where she arrives", () => {
    expect(TRAVEL_MODE_INFO.walk).toMatchObject({ lighting: true, helpAlong: true, helpAtArrival: false });
    for (const m of ["ride", "transit"] as const) expect(TRAVEL_MODE_INFO[m]).toMatchObject({ lighting: false, helpAlong: false, helpAtArrival: true });
  });

  it("recognises modes, and nothing else", () => {
    expect(isTravelMode("walk")).toBe(true);
    expect(isTravelMode("transit")).toBe(true);
    expect(isTravelMode("other")).toBe(false); // the journeys table allows it; it isn't a choice here
    expect(isTravelMode("auto")).toBe(false);
    expect(isTravelMode(3)).toBe(false);
  });

  it("says durations plainly", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(90)).toBe("1 h 30");
    expect(formatMinutes(125)).toBe("2 h 05");
    expect(travelLine("walk", 18)).toBe("18 min walk");
    expect(travelLine("ride", 22)).toBe("22 min by car");
    expect(travelLine("transit", 95)).toBe("1 h 35 by transit");
  });

  it("expects her a little after the provider's estimate, rounded to 5 min, within what a journey accepts", () => {
    expect(expectedMinutes(9)).toBe(20); // 9 × 1.2 + 5 = 15.8 → 20
    expect(expectedMinutes(22)).toBe(35); // 31.4 → 35
    expect(expectedMinutes(1)).toBe(10);
    expect(expectedMinutes(0)).toBe(10);
    expect(expectedMinutes(500)).toBe(TRIP_ETA_MAX);
    for (const n of [0, 1, 9, 22, 60, 190, 196, 500]) {
      const eta = expectedMinutes(n);
      expect(eta).toBeLessThanOrEqual(TRIP_ETA_MAX);
      if (n * 1.2 + 5 <= TRIP_ETA_MAX) expect(eta).toBeGreaterThanOrEqual(n * 1.2 + 5);
    }
  });

  it("stays in step with the journey schema's ETA limits", () => {
    const start = (etaMinutes: number) => startTripSchema.safeParse({ from: FROM, to: { ...FROM, name: "X" }, mode: "ride", etaMinutes }).success;
    expect(start(TRIP_ETA_MIN)).toBe(true);
    expect(start(TRIP_ETA_MAX)).toBe(true);
    expect(start(TRIP_ETA_MIN - 1)).toBe(false);
    expect(start(TRIP_ETA_MAX + 1)).toBe(false);
    expect(start(expectedMinutes(1000))).toBe(true);
    for (const m of TRAVEL_MODES) expect(startTripSchema.safeParse({ from: FROM, to: { ...FROM, name: "X" }, mode: m, etaMinutes: 30 }).success).toBe(true);
  });
});

describe("distances", () => {
  it("uses miles where roads are signed in miles, km elsewhere", () => {
    for (const iso of ["US", "GB", "LR", "MM", "gb"]) expect(distanceUnits(iso)).toBe("imperial");
    for (const iso of ["IN", "AE", "KE", "FR", "IE", "CA"]) expect(distanceUnits(iso)).toBe("metric");
    expect(distanceUnits(null)).toBe("metric");
    expect(distanceUnits(undefined)).toBe("metric");
  });

  it("formats metric distances", () => {
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(1600)).toBe("1.6 km");
    expect(formatDistance(14_230)).toBe("14 km");
    expect(formatDistance(-5)).toBe("0 m");
  });

  it("formats imperial distances", () => {
    expect(formatDistance(100, "imperial")).toBe("330 ft");
    expect(formatDistance(1609.344, "imperial")).toBe("1.0 mi");
    expect(formatDistance(2575, "imperial")).toBe("1.6 mi");
    expect(formatDistance(32_187, "imperial")).toBe("20 mi");
  });
});
