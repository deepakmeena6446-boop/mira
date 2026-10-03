import { describe, expect, it } from "vitest";
import { deterministicIntentHints, validatedModelHints } from "@/domain/plan-intent";
import { draftFromAsk, answerPlanQuestion } from "@/domain/plan-ask";
import { immediateSupportIntent, shouldSeedPlan } from "@/domain/ask-routing";
import { newPlanDraft } from "@/domain/plan-state";
import { movementIntentSchema } from "@/domain/plan-contract";
import type { PlanOptionsResult } from "@/domain/plan-options";
describe("bounded ephemeral intent hints", () => {
  it("keeps the signature dinner's ambiguous arrival separate from the midnight return", () => {
    const message = "Dinner at 9. I’ll leave around midnight and head home.";
    const hints = deterministicIntentHints(message);
    expect(hints).toMatchObject({ origin: "", destination: "", timeKind: "arrive_by", timeHint: "9 (AM/PM unspecified)", returnTimeHint: "midnight" });
    const draft = draftFromAsk(message, newPlanDraft(new Date(), "Asia/Kolkata"));
    expect(draft.departureLocal).toBe(""); expect(draft.timeZone).toBe("");
    expect(validatedModelHints({ ...hints, destination: "9" }, message)).toBeNull();
    expect(deterministicIntentHints("Dinner at 9 Elm Street at 9 PM and leave around midnight")).toMatchObject({ destination: "9 Elm Street", timeHint: "9:00 PM", returnTimeHint: "midnight" });
    expect(deterministicIntentHints("Leave at midnight")).toMatchObject({ timeKind: "depart_at", timeHint: "midnight", returnTimeHint: null });
  });
  it("keeps an event arrival separate from the return and never assumes a date or zone", () => {
    const message = "Go from River Home to Garden Terrace for dinner at 9 PM and return at midnight";
    expect(deterministicIntentHints(message)).toMatchObject({ origin: "River Home", destination: "Garden Terrace", timeKind: "arrive_by", timeHint: "9:00 PM", returnTimeHint: "midnight", loop: false });
    const draft = draftFromAsk(message, newPlanDraft(new Date(), "Asia/Kolkata"));
    expect(deterministicIntentHints("Dinner at 9 PM at Garden Terrace and return at midnight")).toMatchObject({ destination: "Garden Terrace", timeHint: "9:00 PM", returnTimeHint: "midnight", timeKind: "arrive_by" });
    expect(draft.departureLocal).toBe(""); expect(draft.timeZone).toBe(""); expect(draft.returnTimeHint).toBe("midnight");
  });
  it("captures explicit run duration and pace without silently making ride or transit a run", () => {
    const hints = deterministicIntentHints("I want to run from North Gate for 30 min at 4:45 AM, pace 6:30/km");
    expect(hints).toMatchObject({ origin: "North Gate", loop: true, mode: "walk", timeHint: "4:45 AM", loopTarget: { kind: "duration", value: 30 }, paceMinutesPerKm: 6.5 });
    expect(deterministicIntentHints("Walk from Gate to Lake at 18:30")).toMatchObject({ loop: false, destination: "Lake", timeHint: "18:30", timeKind: "depart_at" });
    expect(deterministicIntentHints("Run a 5 km loop from North Gate at 4:45 AM").loopTarget).toEqual({ kind: "distance", value: 5000 });
  });
  it("rejects invented model names/fields and preserves source-bound times and modes", () => {
    const message = "I want to go from River Home to Museum at 9 PM and back at midnight";
    const raw = { ...deterministicIntentHints(message), origin: "Imaginary station", destination: "Museum" };
    expect(validatedModelHints(raw, message)).toBeNull();
    expect(validatedModelHints({ ...raw, origin: "River Home", coordinates: [1, 2] }, message)).toBeNull();
    const accepted = validatedModelHints({ ...raw, origin: "River Home", timeKind: "arrive_by", mode: "ride", timeHint: "1 PM" }, message);
    expect(accepted).toMatchObject({ mode: "walk", timeKind: "depart_at", timeHint: "9:00 PM", returnTimeHint: "midnight" });
  });
  it("routes ordinary discomfort and SOS directly to support and never seeds a plan", () => {
    for (const message of ["I feel uncomfortable", "I am uneasy", "Something feels wrong", "I need options right now", "SOS"]) {
      expect(immediateSupportIntent(message)).not.toBeNull(); expect(shouldSeedPlan(message)).toBe(false);
    }
    expect(immediateSupportIntent("What is the emergency number for Japan?")).toBeNull();
    expect(shouldSeedPlan("Dinner at Garden Terrace at 9 PM")).toBe(true);
  });
  it("describes checked real loop options rather than calling every loop unavailable", () => {
    const plan = movementIntentSchema.parse({ version: 2, activity: "Run", origin: { kind: "named", query: "Gate", resolution: { source: "search", point: { lat: 28.69, lon: 77.21 } } }, destination: null, loop: true, mode: "walk", timeKind: "depart_at", departure: { local: "2026-10-03T04:45", timeZone: "Asia/Kolkata" }, constraints: [], loopTarget: { kind: "duration", value: 30 }, paceMinutesPerKm: 6 });
    const result: PlanOptionsResult = { state: "ready", checkedAt: new Date().toISOString(), source: "Fixture graph", sourceAt: "2026-10-01T00:00:00Z", scope: "fixture loop", options: [{ id: "loop-0", label: "Mapped run loop", minutes: 30, meters: 5000, geometry: [[77.21, 28.69], [77.22, 28.70], [77.21, 28.69]], evidence: [] }], daylight: { status: "unknown", claim: "Daylight", scope: { kind: "area", ref: "fixture" }, reason: "unsupported", retryable: false }, service: { status: "unknown", claim: "Service", scope: { kind: "route", ref: "fixture" }, reason: "unsupported", retryable: false }, detail: "One loop" };
    const answer = answerPlanQuestion("What can I choose?", plan, result);
    expect(answer.next).toBe("review_options"); expect(answer.text).toContain("Mapped run loop"); expect(answer.text).toContain("30 minutes"); expect(answer.text).not.toContain("not available"); expect(answer.text).toContain("unverified");
  });
});
