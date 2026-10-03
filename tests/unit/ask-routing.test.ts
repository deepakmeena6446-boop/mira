import { describe, expect, it } from "vitest";
import { askToolIntent, askUsesPlan, shouldSeedPlan } from "@/domain/ask-routing";
import { draftFromAsk, explicitTimeHint, answerPlanQuestion } from "@/domain/plan-ask";
import { newPlanDraft, returnLegFromMain } from "@/domain/plan-state";
import { movementIntentSchema } from "@/domain/plan-contract";
import { laterDaylight, type PlanOptionsResult } from "@/domain/plan-options";

describe("shared Ask routing", () => {
  it("sends signed-in movement and urgent questions to the ephemeral plan path", () => {
    for (const question of ["Run a loop from North Gate at 4:45 AM", "Take me home", "Plan my late return", "I'm landing in London at 1:30 AM", "Someone is following me"]) {
      expect(askUsesPlan(question, false, true)).toBe(true);
    }
    expect(shouldSeedPlan("Someone is following me")).toBe(false);
  });

  it("preserves signed-in nearby, report and capabilities tools", () => {
    for (const question of ["What can you do?", "What u can help me with?", "Who are you?", "What's open nearby?", "pharmacy near me", "Find Help Points nearby", "Report a broken streetlight"]) {
      expect(askUsesPlan(question, false, true)).toBe(false);
      expect(askUsesPlan(question, true, true)).toBe(false);
      expect(shouldSeedPlan(question)).toBe(false);
    }
    expect(askToolIntent("What is the emergency number in India?")).toBe("emergency_info");
    expect(askUsesPlan("What is the emergency number in India?", true, true)).toBe(true);
    expect(shouldSeedPlan("What is the emergency number in India?")).toBe(false);
    expect(askUsesPlan("What about this plan?", true, true)).toBe(true);
    expect(askUsesPlan("What about this plan?", false, false)).toBe(true);
  });

  it("keeps danger urgent even when a sentence also mentions reporting", () => {
    expect(askUsesPlan("Someone is following me; how do I report it?", true, true)).toBe(true);
    expect(shouldSeedPlan("Someone is following me; how do I report it?")).toBe(false);
  });

  it("retains a stated time as a hint without guessing date or zone", () => {
    expect(explicitTimeHint("Run at 4:45 AM")).toBe("4:45 AM");
    expect(explicitTimeHint("Transfer at 1:30 a.m.")).toBe("1:30 AM");
    expect(explicitTimeHint("Leave at midnight")).toBe("midnight");
    const draft = draftFromAsk("Run a loop from North Gate at 4:45 AM", newPlanDraft(new Date("2026-10-02T00:00:00Z"), "UTC"));
    expect(draft.timeHint).toBe("4:45 AM");
    expect(draft.departureLocal).toBe("");
    expect(draft.timeZone).toBe("");
    const first = answerPlanQuestion("Run a loop from North Gate at 4:45 AM", null, null).text;
    expect(first).toContain("North Gate");
    expect(first).toContain("4:45 AM");
    expect(first).not.toContain("Which starting place should I use?");
    expect(first).toContain("not resolved");
  });

  it("offers only calculated later daylight for an early loop", () => {
    const alternative = laterDaylight("2026-10-02T04:45", "Asia/Kolkata", { lat: 28.69, lon: 77.21 });
    expect(alternative).not.toBeNull();
    expect(alternative!.minutesLater).toBeGreaterThan(45);
    expect(alternative!.minutesLater).toBeLessThanOrEqual(240);
    expect(laterDaylight("2026-03-29T02:30", "Europe/Berlin", { lat: 52.52, lon: 13.4 })).toBeNull();
  });

  it("prefills a return's places but leaves departure and country unasserted", () => {
    const draft = { ...newPlanDraft(new Date("2026-10-02T12:00:00Z"), "Asia/Kolkata"), activity: "Event arrival", origin: { kind: "named" as const, query: "Office", resolution: { source: "search" as const, name: "Office", point: { lat: 28.69, lon: 77.21 } } }, destination: { query: "Venue", resolution: { source: "search" as const, name: "Venue", point: { lat: 28.691, lon: 77.211 } } }, departureLocal: "2026-10-02T18:00" };
    const leg = returnLegFromMain(draft);
    expect(leg).toMatchObject({ label: "Return to Office", origin: { query: "Venue" }, destination: { query: "Office" }, departureLocal: "", timeZone: "", destinationCountryIso: null });
    expect(returnLegFromMain({ ...draft, loop: true })).toBeNull();
  });

  it("does not pass mapped walking time off as ride or transit service", () => {
    const base = movementIntentSchema.parse({ version: 1, activity: "Late return", origin: { kind: "named", query: "Office", resolution: { source: "search", point: { lat: 28.69, lon: 77.21 } } }, destination: { kind: "named", query: "Home", resolution: { source: "search", point: { lat: 28.691, lon: 77.211 } } }, loop: false, departure: { local: "2026-10-02T23:30", timeZone: "Asia/Kolkata" }, mode: "ride", constraints: [] });
    const evidence = { state: "ready", checkedAt: "2026-10-02T00:00:00Z", source: "OSM", sourceAt: "2026-10-01T00:00:00Z", scope: "test", options: [{ id: "walk-0", label: "Walk", minutes: 8, meters: 600, geometry: [], evidence: [{ status: "known", claim: "Mapped walking time", value: 8, scope: { kind: "route", ref: "test" }, source: { id: "osm", label: "OSM", observedAt: "2026-10-01T00:00:00Z", expiresAt: null } }] }], daylight: { status: "known", claim: "Daylight", value: "dark", scope: { kind: "area", ref: "test" }, source: { id: "solar", label: "calculation", observedAt: "2026-10-02T00:00:00Z", expiresAt: null } }, service: { status: "unknown", claim: "Ride and transit", scope: { kind: "route", ref: "test" }, reason: "unsupported", retryable: false }, detail: "One path" } as PlanOptionsResult;
    const answer = answerPlanQuestion("How do I get home?", base, evidence).text;
    expect(answer).toContain("mapped walk is only a reference");
    expect(answer).toContain("Driver, pickup and last-leg access");
    expect(answer).not.toMatch(/ride (?:is|takes) (?:available|8)/i);
  });
});
