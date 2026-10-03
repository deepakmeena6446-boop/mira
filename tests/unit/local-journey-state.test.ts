// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startLocalJourney, updateLocalJourney, startLocalCheckIn, restoreLocalJourney, clearLocalJourneyGuidance, readLocalJourney, localJourneyChoice, recordLocalJourneyCheckIn, readLocalCheckIn, markLocalProgress, endLocalCheckIn } from "@/lib/local-check-in-store";
import { intentFromDraft, newPlanDraft, parsePlanSession, serializePlanSession } from "@/domain/plan-state";
import { planSelectionContext, type PlanOption } from "@/domain/plan-options";
import { clearPlanDraft, setPlanDraft } from "@/lib/plan-store";
import type { MovementIntent } from "@/domain/plan-contract";
const now = new Date("2026-10-03T00:00:00Z");
const draft = { ...newPlanDraft(now, "UTC"), activity: "Fictional run", loop: true, touched: true, origin: { kind: "named" as const, query: "Fictional gate", resolution: { source: "search" as const, name: "Fictional gate", point: { lat: 28.69, lon: 77.21 } } }, loopTarget: { kind: "duration" as const, value: 30 } };
const plan = intentFromDraft(draft)!;
const option: PlanOption = { id: "fixture-out-back", label: "Fictional out and back", minutes: 30, meters: 5000, geometry: [[77.21, 28.69], [77.22, 28.70], [77.21, 28.69]], evidence: [] };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); sessionStorage.clear(); endLocalCheckIn(); });
afterEach(() => { endLocalCheckIn(); vi.useRealTimers(); });
it("progress and private check-in retain the selected route without becoming arrival or extending due", () => {
  const entry = startLocalJourney(plan, option, 30)!;
  markLocalProgress(50); recordLocalJourneyCheckIn();
  expect(readLocalJourney()).toMatchObject({ option, progress: 50, checkedInAt: now.getTime() });
  expect(readLocalCheckIn()).toEqual(entry); expect(localJourneyChoice(plan)).toMatchObject({ optionId: option.id, progress: 50, checkedInAt: now.getTime() });
  const device = JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])));
  expect(device).not.toContain("77.21"); expect(device).not.toContain("Fictional gate");
  expect(startLocalJourney(plan, option, 30)).toBeNull();
});
it("expired and mismatched route context cannot restore guidance", () => {
  startLocalJourney(plan, option, 30);
  expect(localJourneyChoice({ ...plan, paceMinutesPerKm: 8 })).toBeNull();
  vi.setSystemTime(new Date(now.getTime() + 61 * 60_000));
  expect(readLocalJourney()).toBeNull(); expect(localJourneyChoice(plan)).toBeNull(); expect(sessionStorage.getItem("mira.local-journey-choice.v1")).toBeNull();
});
it("unresolved manual places keep their own context rather than sharing an empty route key", () => {
  const unresolved: MovementIntent = { ...plan, origin: { kind: "named", query: "Fictional terminal" }, destination: { kind: "named", query: "Fictional hotel" }, loop: false };
  startLocalJourney(unresolved, null, 30);
  expect(localJourneyChoice(unresolved)).toMatchObject({ optionId: null });
  expect(localJourneyChoice({ ...unresolved, destination: { kind: "named", query: "Different fictional hotel" } })).toBeNull();
  expect(localJourneyChoice({ ...unresolved, departure: { ...unresolved.departure, local: "2026-10-03T01:00" } })).toBeNull();
  const stored = sessionStorage.getItem("mira.local-journey-choice.v1")!;
  expect(stored).not.toContain("Fictional terminal"); expect(stored).not.toContain("Fictional hotel");
});
it("plan expiry clears sensitive in-memory guidance even while a longer private timer remains", () => {
  setPlanDraft(draft); startLocalJourney(plan, option, 180);
  vi.advanceTimersByTime(2 * 60 * 60_000);
  expect(readLocalJourney()).toBeNull(); expect(readLocalCheckIn()).not.toBeNull();
  expect(sessionStorage.getItem("mira.plan.v1")).toBeNull();
  expect(sessionStorage.getItem("mira.local-journey-choice.v1")).toBeNull();
  clearPlanDraft();
});
it("versioned option/recipient preferences survive only the matching plan session and never authorize a start", () => {
  const selected = { ...draft, selection: { optionId: option.id, context: planSelectionContext(plan) }, journeyMode: "location" as const, recipientIds: ["11111111-1111-4111-8111-111111111111"] };
  const restored = parsePlanSession(serializePlanSession(selected, now.getTime()), now.getTime())!;
  expect(restored.selection?.context).toBe(planSelectionContext(intentFromDraft(restored)!)); expect(restored.recipientIds).toEqual(selected.recipientIds); expect(readLocalCheckIn()).toBeNull();
  expect(restored.selection?.context).not.toBe(planSelectionContext({ ...plan, departure: { ...plan.departure, local: "2026-10-03T01:00" } }));
  expect(parsePlanSession(serializePlanSession(selected, now.getTime()), now.getTime() + 2 * 60 * 60_000)).toBeNull();
});
it("a reviewed private update keeps the original start, resets progress, and persists only a timestamp receipt and matching choice", () => {
  const entry = startLocalJourney(plan, option, 60)!;
  markLocalProgress(75); recordLocalJourneyCheckIn();
  vi.setSystemTime(new Date(now.getTime() + 10 * 60_000));
  const next = { ...plan, activity: "Fictional continued route", paceMinutesPerKm: 8 };
  const nextOption = { ...option, id: "fixture-continued", geometry: [[77.2, 28.7], [77.3, 28.8]] as [number, number][] };
  expect(updateLocalJourney(next, nextOption, 25, entry)).toEqual({ ...entry, dueAt: Date.now() + 25 * 60_000 });
  expect(readLocalJourney()).toMatchObject({ plan: next, option: nextOption, progress: 0, checkedInAt: null, updatedAt: Date.now() });
  expect(localJourneyChoice(plan)).toBeNull();
  const choice = localJourneyChoice(next)!;
  expect(choice).toMatchObject({ optionId: nextOption.id, progress: 0, checkedInAt: null, updatedAt: Date.now(), savedAt: Date.now() });
  const stored = sessionStorage.getItem("mira.local-journey-choice.v1")!;
  expect(stored).not.toContain("Fictional"); expect(stored).not.toContain("77.3"); expect(stored).not.toContain("geometry");
  // A reload can restore the receipt alongside the reviewed route, without re-confirming an action.
  restoreLocalJourney(next, nextOption, choice.progress, choice.checkedInAt);
  expect(readLocalJourney()?.updatedAt).toBe(Date.now());
});
it("private updates reject a mismatched reviewed timer, invalid context, and extension past the original 235-minute cap without mutation", () => {
  const entry = startLocalJourney(plan, option, 235)!;
  markLocalProgress(50);
  const before = sessionStorage.getItem("mira.local-journey-choice.v1");
  vi.setSystemTime(new Date(now.getTime() + 230 * 60_000));
  expect(updateLocalJourney(plan, option, 6, entry)).toBeNull();
  expect(updateLocalJourney(plan, option, 5, { ...entry, dueAt: entry.dueAt - 1 })).toBeNull();
  expect(updateLocalJourney({ ...plan, departure: { ...plan.departure, local: "invalid" } }, option, 5, entry)).toBeNull();
  expect(readLocalCheckIn()).toEqual(entry); expect(sessionStorage.getItem("mira.local-journey-choice.v1")).toBe(before);
  expect(updateLocalJourney(plan, option, 5, entry)?.startedAt).toBe(entry.startedAt);
  expect(readLocalCheckIn()?.dueAt).toBe(entry.startedAt + 235 * 60_000);
});
it("an active timestamp-only timer can receive reviewed manual guidance, whose update receipt expires after two hours", () => {
  const entry = startLocalCheckIn(235)!;
  expect(readLocalJourney()).toBeNull();
  vi.setSystemTime(new Date(now.getTime() + 10 * 60_000));
  expect(updateLocalJourney(plan, null, 220, entry)?.startedAt).toBe(entry.startedAt);
  expect(localJourneyChoice(plan)?.updatedAt).toBe(Date.now());
  vi.advanceTimersByTime(2 * 60 * 60_000);
  expect(readLocalJourney()).toBeNull(); expect(localJourneyChoice(plan)).toBeNull(); expect(readLocalCheckIn()).not.toBeNull();
  expect(sessionStorage.getItem("mira.local-journey-choice.v1")).toBeNull();
  clearLocalJourneyGuidance();
});
