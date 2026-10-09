// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { saveEligibility } from "@/domain/plan-save";
import { newPlanDraft, serializePlanSession, parsePlanSession, type PlanDraft } from "@/domain/plan-state";
import { queryFor } from "@/app/(app)/plan/PlanSheets";

// Sprint mira-companion-48h A24/A25: what can be saved is said before the tap, and a provider's display name
// never becomes the query a plan keeps as hers. Synthetic, labelled provider results; no live Google call.
const at = (lat: number, lon: number) => ({ lat, lon });
const base = (): PlanDraft => ({ ...newPlanDraft(new Date("2026-10-09T12:00:00Z"), "Asia/Kolkata"), touched: true, activity: "Dinner", departureLocal: "2026-10-09T21:00" });
const osm = (query: string, name: string) => ({ query, resolution: { source: "search" as const, name, point: at(28.69, 77.21), placeId: "osm:1" } });
const google = (query: string) => ({ query, resolution: { source: "search" as const, name: "Synthetic Google Place — test only", point: at(28.7, 77.22), placeId: "g:synthetic-test-only" } });
const named = (d: PlanDraft, origin: { query: string; resolution: PlanDraft["destination"]["resolution"] }, destination: PlanDraft["destination"]): PlanDraft => ({ ...d, origin: { kind: "named", ...origin }, destination });

describe("saveEligibility", () => {
  it("asks for a named start instead of saving a GPS point", () => {
    const d = { ...base(), origin: { kind: "device" as const, use: "from_here" as const, point: at(28.69, 77.21) }, destination: osm("metro", "Vishwavidyalaya Metro") };
    expect(saveEligibility(d, { signedIn: true })).toEqual({ ok: false, code: "device_origin", message: "Choose a named starting place to save this plan." });
  });

  it("explains that Google place details can stay in the tab but not in the account, with the tab's lifetime", () => {
    const r = saveEligibility(named(base(), osm("north campus", "North Campus"), google("hauz khas")), { signedIn: true });
    expect(r).toMatchObject({ ok: false, code: "provider_content" });
    expect(!r.ok && r.message).toBe("This plan can stay in this tab, but Mira can’t save these place details to your account yet. You may need to choose the places again after a reload. It stays in this tab for 2 hours after your last change.");
  });

  it("names the leg that needs finishing", () => {
    const d = named(base(), osm("north campus", "North Campus"), osm("metro", "Metro"));
    d.legs = [{ label: "Return to north campus", origin: osm("metro", "Metro"), destination: osm("north campus", "North Campus"), departureLocal: "", timeZone: "Asia/Kolkata", mode: "walk", timeKind: "depart_at", constraints: "", destinationCountryIso: null }];
    expect(saveEligibility(d, { signedIn: true })).toEqual({ ok: false, code: "incomplete_leg", legIndex: 0, message: "Finish the way back — choose when it leaves — to save this plan." });
  });

  it("checks content before sending a guest to sign in, then says sign in", () => {
    const d = named(base(), osm("north campus", "North Campus"), osm("metro", "Metro"));
    expect(saveEligibility(d, { signedIn: false })).toMatchObject({ ok: false, code: "guest" });
    expect(saveEligibility(d, { signedIn: true })).toEqual({ ok: true });
  });
});

describe("queryFor and the tab session (main and return flows)", () => {
  it("keeps her typed words, never a Google display name", () => {
    expect(queryFor({ name: "Synthetic Google Place — test only", lat: 1, lon: 1, source: "search", placeId: "g:x", typed: "hauz khas" })).toBe("hauz khas");
    expect(queryFor({ name: "Synthetic Google Place — test only", lat: 1, lon: 1, source: "search", placeId: "g:x" })).toBe("");
    expect(queryFor({ name: "Vishwavidyalaya Metro Gate No. 3", lat: 1, lon: 1, source: "search", placeId: "osm:9" })).toBe("Vishwavidyalaya Metro Gate No. 3");
    expect(queryFor({ name: "Home", lat: 1, lon: 1, source: "saved_place", placeId: "p1", typed: "ho" })).toBe("Home");
  });

  it("serialises a Google pick with her query only, so a reload asks her to choose again", () => {
    const d = named(base(), osm("north campus", "North Campus"), google(queryFor({ name: "Synthetic Google Place — test only", lat: 1, lon: 1, source: "search", placeId: "g:x", typed: "hauz khas" })));
    d.legs = [{ label: "Return to north campus", origin: { ...d.destination }, destination: osm("north campus", "North Campus"), departureLocal: "2026-10-09T23:30", timeZone: "Asia/Kolkata", mode: "walk", timeKind: "depart_at", constraints: "", destinationCountryIso: null }];
    const raw = serializePlanSession(d, Date.now());
    expect(raw).not.toContain("Synthetic Google Place");
    expect(raw).not.toContain("28.7,");
    const back = parsePlanSession(raw, Date.now())!;
    expect(back.destination).toEqual({ query: "hauz khas", resolution: null });
    expect(back.legs![0].origin).toEqual({ query: "hauz khas", resolution: null });
  });
});
