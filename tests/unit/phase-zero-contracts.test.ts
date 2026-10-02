import { describe, expect, it } from "vitest";
import { movementIntentSchema, planActionSchema, planEvidenceSchema, PLAN_CONTRACT_VERSION } from "@/domain/plan-contract";
import { purgeAt, PURGE_AFTER_CLOSE_MS, userTransition } from "@/domain/journey";

const remoteRun = {
  version: PLAN_CONTRACT_VERSION,
  activity: "early run",
  origin: { kind: "named", query: "Hotel near the station" },
  destination: null,
  loop: true,
  departure: { local: "2026-11-02T04:45", timeZone: "Europe/London" },
  mode: "walk",
  constraints: ["step-free route"],
};

describe("Phase 0 movement contracts", () => {
  it("round trips a future named-origin plan without current GPS or account state", () => {
    const parsed = movementIntentSchema.parse(JSON.parse(JSON.stringify(remoteRun)));
    expect(parsed.origin).toEqual({ kind: "named", query: "Hotel near the station" });
    expect(parsed.departure).toEqual(remoteRun.departure);
    expect(JSON.stringify(parsed)).not.toMatch(/currentLocation|deviceLocation|userId/);
  });

  it("requires an explicit from-here origin for device coordinates", () => {
    expect(movementIntentSchema.safeParse({ ...remoteRun, origin: { kind: "device", point: { lat: 51.5, lon: -0.12 } } }).success).toBe(false);
    expect(movementIntentSchema.safeParse({ ...remoteRun, origin: { kind: "device", use: "from_here", point: { lat: 51.5, lon: -0.12 } } }).success).toBe(true);
    expect(movementIntentSchema.safeParse({ ...remoteRun, origin: { kind: "named", query: "Hotel", point: { lat: 51.5, lon: -0.12 } } }).success).toBe(false);
    expect(movementIntentSchema.safeParse({ ...remoteRun, origin: { kind: "named", query: "Hotel", resolution: { source: "search", point: { lat: 51.5, lon: -0.12 } } } }).success).toBe(true);
    expect(movementIntentSchema.safeParse({ ...remoteRun, departure: { local: remoteRun.departure.local, timeZone: "invalid/zone" } }).success).toBe(false);
    expect(movementIntentSchema.safeParse({ ...remoteRun, departure: { local: "2026-02-30T04:45", timeZone: "Europe/London" } }).success).toBe(false);
    expect(movementIntentSchema.safeParse({ ...remoteRun, loop: false }).success).toBe(false);
  });

  it("keeps source, time and scope on a known claim, and an explicit reason on an unknown claim", () => {
    const scope = { kind: "route", ref: "option-1" };
    expect(planEvidenceSchema.safeParse({ status: "known", claim: "daylight", value: false, scope, source: { id: "calculation", label: "Sun position", observedAt: "2026-11-02T04:45:00Z", expiresAt: null } }).success).toBe(true);
    expect(planEvidenceSchema.safeParse({ status: "known", claim: "lighting", value: "lit", scope }).success).toBe(false);
    expect(planEvidenceSchema.safeParse({ status: "known", claim: "lighting", value: "lit", scope, source: { id: "map", label: "Map", observedAt: null, expiresAt: null } }).success).toBe(false);
    expect(planEvidenceSchema.parse({ status: "unknown", claim: "lighting", scope, reason: "no_data", retryable: false })).not.toHaveProperty("value");
    expect(planEvidenceSchema.safeParse({ status: "unknown", claim: "lighting", scope, reason: "provider_failed", retryable: true, value: "lit" }).success).toBe(false);
  });

  it("cannot serialize an action as complete without a receipt", () => {
    const proposal = { state: "proposed", proposalId: "p-1", kind: "share", summary: "Share with chosen contact", requiresConfirmation: true };
    expect(planActionSchema.parse(proposal)).toEqual(proposal);
    expect(planActionSchema.safeParse({ ...proposal, state: "confirmed" }).success).toBe(false);
    expect(planActionSchema.safeParse({ state: "confirmed", proposalId: "p-1", receiptId: "r-1", kind: "share", completedAt: "2026-11-02T05:00:00Z" }).success).toBe(true);
  });
});

describe("Phase 0 journey retention contract", () => {
  it("closes explicitly and computes the six-hour hard-delete deadline", () => {
    expect(userTransition("active", "end")).toEqual({ ok: true, next: "ended", changed: true });
    const closed = new Date("2026-11-02T05:00:00Z");
    expect(PURGE_AFTER_CLOSE_MS).toBe(6 * 60 * 60_000);
    expect(purgeAt(closed).toISOString()).toBe("2026-11-02T11:00:00.000Z");
  });
});
