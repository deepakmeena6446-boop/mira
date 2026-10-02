import { describe, expect, it } from "vitest";
import { hasPlanWork, intentFromDraft, newPlanDraft, parsePlanSession, PLAN_SESSION_TTL_MS, resolvedDestination, resolvedOrigin, serializePlanSession } from "@/domain/plan-state";

const now = new Date("2026-11-02T04:00:00Z");
const origin = { source: "search" as const, name: "Station", point: { lat: 51.5, lon: -0.12 }, placeId: "station-1" };
const destination = { source: "search" as const, name: "Museum", point: { lat: 51.51, lon: -0.11 }, placeId: "museum-1" };

describe("Phase 1 transient plan state", () => {
  it("round trips a remote future intent with its origin, time zone, mode and constraints", () => {
    const draft = { ...newPlanDraft(now, "Europe/London"), activity: "Visit a museum", origin: { kind: "named" as const, query: "Station", resolution: origin }, destination: { query: "Museum", resolution: destination }, departureLocal: "2026-11-03T09:30", mode: "transit" as const, constraints: "step-free, low cost" };
    const reloaded = parsePlanSession(serializePlanSession(draft, now.getTime()), now.getTime() + 60_000)!;
    const intent = intentFromDraft(reloaded)!;
    expect(intent.departure).toEqual({ local: "2026-11-03T09:30", timeZone: "Europe/London" });
    expect(intent.origin.kind).toBe("named");
    expect(resolvedOrigin(intent)).toEqual(origin.point);
    expect(resolvedDestination(intent)).toEqual({ name: "Museum", ...destination.point });
    expect(intent.mode).toBe("transit");
    expect(intent.constraints).toEqual(["step-free", "low cost"]);
  });

  it("retains an unresolved named origin without substituting current GPS", () => {
    const draft = { ...newPlanDraft(now, "Asia/Kolkata"), activity: "Early run", origin: { kind: "named" as const, query: "Unfamiliar park", resolution: null }, loop: true, departureLocal: "2026-11-03T04:45" };
    const intent = intentFromDraft(draft)!;
    expect(hasPlanWork(draft)).toBe(true);
    expect(intent.origin).toEqual({ kind: "named", query: "Unfamiliar park" });
    expect(resolvedOrigin(intent)).toBeNull();
    expect(resolvedDestination(intent)).toBeNull();
  });

  it("keeps a partial time-only edit visible across surfaces", () => {
    const draft = { ...newPlanDraft(now, "Asia/Kolkata"), touched: true, departureLocal: "2026-11-03T04:45" };
    expect(hasPlanWork(parsePlanSession(serializePlanSession(draft, now.getTime()), now.getTime())!)).toBe(true);
    expect(intentFromDraft(draft)).toBeNull();
  });

  it("expires the tab plan and rejects malformed stored data", () => {
    const draft = newPlanDraft(now, "UTC");
    expect(hasPlanWork(draft)).toBe(false);
    const saved = serializePlanSession(draft, now.getTime());
    expect(parsePlanSession(saved, now.getTime() + PLAN_SESSION_TTL_MS - 1)).toEqual(draft);
    expect(parsePlanSession(saved, now.getTime() + PLAN_SESSION_TTL_MS)).toBeNull();
    expect(parsePlanSession("{broken", now.getTime())).toBeNull();
    expect(parsePlanSession(JSON.stringify({ savedAt: now.getTime(), draft: { ...draft, version: 99 } }), now.getTime())).toBeNull();
  });

  it("does not persist Google Places content in the tab plan", () => {
    const draft = { ...newPlanDraft(now, "Asia/Kolkata"), origin: { kind: "named" as const, query: "my typed gate", resolution: { source: "search" as const, name: "Provider result", point: { lat: 28.7, lon: 77.2 }, placeId: "g:abc" } }, destination: { query: "my typed library", resolution: { source: "search" as const, name: "Other provider result", point: { lat: 28.71, lon: 77.21 }, placeId: "g:def" } } };
    const saved = serializePlanSession(draft, now.getTime());
    expect(saved).not.toContain("Provider result");
    expect(saved).not.toContain("28.7");
    expect(saved).not.toContain("g:abc");
    expect(parsePlanSession(saved, now.getTime())?.origin).toEqual({ kind: "named", query: "my typed gate", resolution: null });
  });
});
