import { describe, expect, it } from "vitest";
import { companionNewsEligibility } from "@/domain/safety-updates";
import { planBrief, updatesClaim } from "@/lib/brief";
import type { SafetyUpdatesData } from "@/domain/safety-updates";

// Sprint mira-companion-48h A10/A11 (03 §C): automatic news enters a companion summary only when the source itself
// establishes scope, present relevance and an implication. Current SafetyUpdate data can't, so the default is empty.
const base = { publisher: "Delhi Police", originalUrl: "https://example.org/advisory", summary: null };

describe("companion news gate", () => {
  it("rejects a story without publisher or source link", () => {
    expect(companionNewsEligibility({ ...base, publisher: " ", locationPrecision: "exact" }, "place")).toEqual({ eligible: false, reason: "source_metadata" });
    expect(companionNewsEligibility({ ...base, originalUrl: "", locationPrecision: "exact" }, "place")).toEqual({ eligible: false, reason: "source_metadata" });
  });

  it("never treats a city-level story as on this route or at this place", () => {
    for (const precision of ["city", "district", "region", "country", "mentioned"] as const) {
      expect(companionNewsEligibility({ ...base, locationPrecision: precision }, "route")).toEqual({ eligible: false, reason: "scope_mismatch" });
      expect(companionNewsEligibility({ ...base, locationPrecision: precision }, "area")).toEqual({ eligible: false, reason: "scope_mismatch" });
    }
  });

  it("does not promote even an exact official story indexed today: recency is not present relevance", () => {
    expect(companionNewsEligibility({ ...base, locationPrecision: "exact" }, "place")).toEqual({ eligible: false, reason: "no_present_relevance" });
  });

  it("keeps an indexed story out of the short answer and words it as indexed, not as happening here", () => {
    const data = { windowDays: 7, updates: [{ id: "u", category: "harassment", publisher: "Daily Example", publishedAt: new Date().toISOString() }] } as unknown as SafetyUpdatesData;
    const claim = updatesClaim({ evidence: { state: "ready", sources: [], data } }, "near there");
    expect(claim.claim).toMatch(/^1 report indexed for this area in the past 7 days · latest: .*first indexed/);
    expect(claim.source).toMatch(/location as reported, not checked against this place/);
    expect(claim.claim).not.toMatch(/on (this|your) route/i);
    expect(planBrief([claim], { mode: "walk", loop: false }).items).toEqual([]);
  });
});
