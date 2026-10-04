import { describe, expect, it } from "vitest";
import { clockChangeAt, instantForLocal } from "@/domain/plan-options";
import { activatePlanLeg, intentFromLeg, newPlanDraft, newPlanLeg, parsePlanSession, planDraftSchema, serializePlanSession } from "@/domain/plan-state";

const now = new Date("2026-10-02T00:00:00Z");

describe("Phase 5 remote travel contracts", () => {
  it("preserves two independently timed named legs without current GPS", () => {
    const base = newPlanDraft(now, "Europe/London");
    const arrival = { ...newPlanLeg(), label: "Airport to hotel", origin: { query: "Airport", resolution: null }, destination: { query: "Hotel", resolution: null }, departureLocal: "2026-10-03T01:30", timeZone: "Asia/Kolkata", destinationCountryIso: "IN" };
    const second = { ...newPlanLeg(), label: "Station to venue", origin: { query: "Station", resolution: null }, destination: { query: "Venue", resolution: null }, departureLocal: "2026-10-05T09:00", timeZone: "Europe/London", destinationCountryIso: "GB" };
    const saved = serializePlanSession({ ...base, legs: [arrival, second] }, now.getTime());
    const reloaded = parsePlanSession(saved, now.getTime())!;
    expect(reloaded.legs).toHaveLength(2);
    expect(intentFromLeg(reloaded.legs![0])?.origin).toEqual({ kind: "named", query: "Airport" });
    expect(intentFromLeg(reloaded.legs![1])?.departure.timeZone).toBe("Europe/London");
    expect(reloaded.legs![0].destinationCountryIso).toBe("IN");
  });

  it("does not persist provider place content on any travel leg", () => {
    const base = newPlanDraft(now, "UTC");
    const provider = { source: "search" as const, name: "Private result", point: { lat: 51.5, lon: -0.1 }, placeId: "g:secret" };
    const leg = { ...newPlanLeg(), origin: { query: "my typed airport", resolution: provider }, destination: { query: "my typed hotel", resolution: provider } };
    const saved = serializePlanSession({ ...base, legs: [leg] }, now.getTime());
    expect(saved).not.toContain("Private result");
    expect(saved).not.toContain("g:secret");
    expect(saved).not.toContain("51.5");
    expect(parsePlanSession(saved, now.getTime())?.legs?.[0].origin.resolution).toBeNull();
  });

  it("selects a return leg for review without overwriting the arrival leg or starting a journey", () => {
    const place = (query: string, lat: number) => ({ query, resolution: { source: "search" as const, name: query, point: { lat, lon: 77.2 } } });
    const base = { ...newPlanDraft(now, "Asia/Kolkata"), activity: "Arrive at event", origin: { kind: "named" as const, ...place("Station", 28.69) }, destination: place("Venue", 28.70), departureLocal: "2026-10-02T18:00" };
    const returnLeg = { ...newPlanLeg(), label: "Return from event", origin: place("Venue", 28.70), destination: place("Station", 28.69), departureLocal: "2026-10-02T22:30", timeZone: "Asia/Kolkata" };
    const selected = activatePlanLeg({ ...base, legs: [returnLeg] }, 0);
    expect(() => planDraftSchema.parse(selected)).not.toThrow();
    expect(selected?.activity).toBe("Return from event");
    expect(selected?.origin).toMatchObject({ kind: "named", query: "Venue" });
    expect(selected?.legs?.[0]).toMatchObject({ label: "Arrive at event", origin: { query: "Station" }, destination: { query: "Venue" }, departureLocal: "2026-10-02T18:00" });
    expect(activatePlanLeg({ ...base, legs: [{ ...returnLeg, destination: { query: "Station", resolution: null } }] }, 0)).toBeNull();
  });

  it("converts local instants and refuses DST gap, overlap, and invalid zone", () => {
    expect(instantForLocal("2026-10-03T01:30", "Asia/Kolkata")?.toISOString()).toBe("2026-10-02T20:00:00.000Z");
    expect(instantForLocal("2026-03-29T01:30", "Europe/London")).toBeNull();
    expect(instantForLocal("2026-10-25T01:30", "Europe/London")).toBeNull();
    expect(instantForLocal("2026-10-03T01:30", "Mars/Base")).toBeNull();
  });

  it("reviews a complete later leg while preserving an independently unfinished main leg", () => {
    const base = { ...newPlanDraft(now, "UTC"), activity: "Unfinished first transfer", departureLocal: "", origin: { kind: "named" as const, query: "Terminal still being chosen", resolution: null } };
    const place = (query: string, lat: number) => ({ query, resolution: { source: "search" as const, name: query, point: { lat, lon: 77.2 } } });
    const later = { ...newPlanLeg(), label: "Fictional station to venue", origin: place("Station", 28.69), destination: place("Venue", 28.70), departureLocal: "2026-10-03T09:00", timeZone: "Asia/Kolkata" };
    const selected = activatePlanLeg({ ...base, legs: [later] }, 0)!;
    expect(selected.activity).toBe(later.label);
    expect(selected.legs?.[0]).toMatchObject({ label: base.activity, origin: { query: base.origin.query, resolution: null }, departureLocal: "" });
    expect(intentFromLeg(selected.legs![0])).toBeNull();
    expect(() => planDraftSchema.parse(selected)).not.toThrow();
  });

  it("plans 'now' in the repeated hour when clocks go back, and says why other times there aren't guessed (audit P05-003)", () => {
    // Lisbon, 25 Oct 2026: 01:00–01:59 happens twice (WEST then WET). At 01:30 WET (the second one), "now" is that one.
    const secondOne = new Date("2026-10-25T01:30:00Z");
    expect(instantForLocal("2026-10-25T01:30", "Europe/Lisbon", secondOne)?.toISOString()).toBe("2026-10-25T01:30:00.000Z");
    const firstOne = new Date("2026-10-25T00:30:00Z");
    expect(instantForLocal("2026-10-25T01:30", "Europe/Lisbon", firstOne)?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    // Days ahead, Mira won't pick one of the two.
    expect(instantForLocal("2026-10-25T01:30", "Europe/Lisbon", new Date("2026-10-20T12:00:00Z"))).toBeNull();
    expect(clockChangeAt("2026-10-25T01:30", "Europe/Lisbon")).toBe("repeated");
    expect(clockChangeAt("2027-03-14T02:30", "America/New_York")).toBe("skipped");
    // A plan seeded without a time (\"walk home\") is not a clock change, in India or anywhere (re-audit RA4).
    for (const local of ["", "2026-10-04T", "2026-10-04"]) expect(clockChangeAt(local, "Asia/Kolkata")).toBeNull();
    expect(clockChangeAt("2026-10-03T21:00", "Asia/Kolkata")).toBeNull();
  });
});
