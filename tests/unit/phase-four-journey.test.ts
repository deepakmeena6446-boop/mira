import { describe, expect, it } from "vitest";
import { movementIntentSchema } from "@/domain/plan-contract";
import { loopCheckInEligibility, planStartEligibility } from "@/domain/plan-journey";
import type { PlanOption } from "@/domain/plan-options";
import { rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { parseOpeningHours } from "@/domain/opening-hours";

const now = Date.parse("2026-10-02T04:00:00Z");
const from = { lat: 28.69, lon: 77.21 };
const to = { lat: 28.691, lon: 77.211 };
const plan = movementIntentSchema.parse({ version: 1, activity: "Walk home", origin: { kind: "named", query: "Library", resolution: { source: "search", point: from } }, destination: { kind: "named", query: "Home", resolution: { source: "search", point: to } }, loop: false, departure: { local: "2026-10-02T09:30", timeZone: "Asia/Kolkata" }, mode: "walk", constraints: [] });
const option: PlanOption = { id: "walk-0", label: "Mapped walk", minutes: 10, meters: 700, geometry: [[from.lon, from.lat], [to.lon, to.lat]], evidence: [] };
const fix = { ...from, accuracy: 20, at: now - 1000 };

describe("Phase 4 journey and support gates", () => {
  it("starts only near the resolved origin, at the planned time, with a fresh accurate fix and mapped walk", () => {
    expect(planStartEligibility(plan, option, fix, now)).toEqual({ ok: true });
    expect(planStartEligibility(plan, null, fix, now).ok).toBe(false);
    expect(planStartEligibility(plan, option, { ...fix, lat: 28.70 }, now).ok).toBe(false);
    expect(planStartEligibility(plan, option, { ...fix, at: now - 31_000 }, now).ok).toBe(false);
    expect(planStartEligibility(plan, option, { ...fix, accuracy: 150 }, now).ok).toBe(false);
    expect(planStartEligibility(plan, { ...option, geometry: [[0, 0], [1, 1]] }, fix, now).ok).toBe(false);
    expect(planStartEligibility(plan, option, fix, now + 31 * 60_000).ok).toBe(false);
    expect(planStartEligibility({ ...plan, mode: "ride" }, option, fix, now).ok).toBe(false);
  });

  it("allows a manual loop check-in only at its resolved origin and planned time", () => {
    const loop = { ...plan, loop: true, destination: null };
    expect(loopCheckInEligibility(loop, fix, now)).toEqual({ ok: true });
    expect(loopCheckInEligibility(loop, null, now).ok).toBe(false);
    expect(loopCheckInEligibility(loop, { ...fix, at: now - 31_000 }, now).ok).toBe(false);
    expect(loopCheckInEligibility(loop, { ...fix, lat: 28.70 }, now).ok).toBe(false);
    expect(loopCheckInEligibility(loop, fix, now + 31 * 60_000).ok).toBe(false);
    expect(loopCheckInEligibility({ ...loop, mode: "ride" }, fix, now).ok).toBe(false);
  });

  it("excludes known closed candidates and leaves unverified hours explicit", () => {
    const base: HelpPoint = { id: "open-hours-unknown", name: "Hotel", cls: "hotel", ...to, open24h: false, hours: null, source: "osm" };
    const closed: HelpPoint = { ...base, id: "closed", name: "Pharmacy", cls: "pharmacy", schedule: parseOpeningHours("Mo-Su 09:00-17:00"), hours: "Mo-Su 09:00-17:00" };
    const candidates = rankHelpPoints([closed, base], from, { situation: "unsafe", night: true, now: { day: 5, minute: 22 * 60 }, at: now });
    expect(candidates.map((p) => p.id)).toEqual(["open-hours-unknown"]);
    expect(candidates[0].hoursNow.kind).toBe("unknown");
  });
});
