// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isRestrictedPlaceId, newPlanDraft, parsePlanSession, providerPlace, serializePlanSession, UNKNOWN_PROVENANCE, type PlanDraft } from "@/domain/plan-state";
import { saveEligibility } from "@/domain/plan-save";
import { planGoingTo, planToCardPlace } from "@/lib/plan-handoff";
import { clearPlanDraft, currentPlanDraft } from "@/lib/plan-store";

// Sprint mira-companion-48h review (issue 5): a place from a provider card keeps its provenance through hand-offs.
// Before the fix, a card place without an id became `selected_point` and passed the Google persistence guard.
// Synthetic, labelled provider data; no live provider call.
const named = (destination: PlanDraft["destination"]): PlanDraft => ({
  ...newPlanDraft(new Date("2026-10-09T12:00:00Z"), "Asia/Kolkata"),
  touched: true,
  activity: "Dinner",
  departureLocal: "2026-10-09T21:00",
  origin: { kind: "named", query: "north campus", resolution: { source: "search", name: "North Campus", point: { lat: 28.69, lon: 77.21 }, placeId: "osm:node/1" } },
  destination,
});
const asDestination = (p: ReturnType<typeof providerPlace>) => ({ query: p.query, resolution: p.resolution });

beforeEach(() => clearPlanDraft());

describe("provider provenance rules", () => {
  it("treats Google and unknown-source places as content Mira can't keep; OSM, saved places and her own points stay savable", () => {
    expect([isRestrictedPlaceId("g:abc"), isRestrictedPlaceId(UNKNOWN_PROVENANCE), isRestrictedPlaceId("osm:node/1"), isRestrictedPlaceId("3f6d…saved"), isRestrictedPlaceId(undefined)]).toEqual([true, true, false, false, false]);
  });

  it("a card place without a recorded source can't be saved, and its name isn't kept as her query", () => {
    const p = providerPlace({ name: "Synthetic Café — test only", lat: 28.7, lon: 77.22 });
    expect(p).toEqual({ query: "Place you chose", activity: "Go to a place you chose", resolution: { source: "search", name: "Synthetic Café — test only", point: { lat: 28.7, lon: 77.22 }, placeId: UNKNOWN_PROVENANCE } });
    expect(saveEligibility(named(asDestination(p)), { signedIn: true })).toMatchObject({ ok: false, code: "provider_content" });
    const raw = serializePlanSession(named(asDestination(p)), Date.now());
    expect(raw).not.toContain("Synthetic Café");
    expect(parsePlanSession(raw, Date.now())!.destination).toEqual({ query: "Place you chose", resolution: null });
  });

  it("a Google card place is restricted the same way; an OSM card place and a saved place stay savable", () => {
    expect(saveEligibility(named(asDestination(providerPlace({ name: "G — test only", lat: 1, lon: 1, placeId: "g:x" }))), { signedIn: true })).toMatchObject({ code: "provider_content" });
    expect(saveEligibility(named(asDestination(providerPlace({ name: "Arts Faculty", lat: 28.69, lon: 77.21, placeId: "osm:way/2" }))), { signedIn: true })).toEqual({ ok: true });
    expect(saveEligibility(named(asDestination(providerPlace({ name: "Home", lat: 28.69, lon: 77.21, savedPlaceId: "8b0f1f8e-0000-4000-8000-000000000001" }))), { signedIn: true })).toEqual({ ok: true });
  });
});

describe("hand-offs into a plan", () => {
  it("comparing a card place (no id) gives a tab-only plan", () => {
    planToCardPlace({ name: "Synthetic Café — test only", lat: 28.7, lon: 77.22 }, null);
    const d = currentPlanDraft()!;
    expect(d.destination.resolution).toMatchObject({ source: "search", placeId: UNKNOWN_PROVENANCE });
    expect(d.activity).toBe("Go to a place you chose");
    expect(saveEligibility(named(d.destination), { signedIn: true })).toMatchObject({ code: "provider_content" });
  });

  it("a Help Point from Google (I feel unsafe → Go there, or the map) keeps its id", () => {
    planGoingTo({ name: "Synthetic Hospital — test only", lat: 28.7, lon: 77.22, source: "search", placeId: "g:hosp" }, { lat: 28.69, lon: 77.21 });
    expect(currentPlanDraft()!.destination).toEqual({ query: "Place you chose", resolution: { source: "search", name: "Synthetic Hospital — test only", point: { lat: 28.7, lon: 77.22 }, placeId: "g:hosp" } });
  });

  it("a point she picked on the map stays hers and savable", () => {
    planGoingTo({ name: "The spot you picked", lat: 28.7, lon: 77.22, source: "selected_point" }, null);
    const d = currentPlanDraft()!;
    expect(d.destination).toEqual({ query: "The spot you picked", resolution: { source: "selected_point", name: "The spot you picked", point: { lat: 28.7, lon: 77.22 } } });
    expect(saveEligibility(named(d.destination), { signedIn: true })).toEqual({ ok: true });
  });
});
