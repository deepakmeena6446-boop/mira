import { describe, expect, it } from "vitest";
import { briefLimitation, routeTimeLimitation, selectBrief, type BriefCandidate } from "@/domain/companion-brief";
import { daylightClaim, helpClaim, notesClaim, planBrief, updatesClaim, walkTimeClaim, blindSpotsClaim, type Claim } from "@/lib/brief";
import type { SafetyUpdatesData } from "@/domain/safety-updates";
import { departureForZone } from "@/domain/plan-options";

// Sprint mira-companion-48h acceptance A06–A09 (unit level): the short answer selects, never invents.
const c = (id: string, tier: BriefCandidate["tier"], kind: BriefCandidate["kind"] = "listed", text = `fact ${id}`): BriefCandidate => ({ id, tier, kind, text, scopeLabel: "here" });

describe("selectBrief", () => {
  it("keeps at most three items, in tier order, and returns the rest for the detail view", () => {
    const { items, rest } = selectBrief([c("a", "secondary"), c("b", "timely"), c("c", "action"), c("d", "asked"), c("e", "secondary")]);
    expect(items.map((i) => i.id)).toEqual(["d", "c", "b"]);
    expect(rest.map((i) => i.id)).toEqual(["a", "e"]);
    expect(items[0]).not.toHaveProperty("tier");
  });

  it("puts a failed check ahead of a decorative fact in the same tier", () => {
    expect(selectBrief([c("pretty", "secondary"), c("broken", "secondary", "failed")]).items.map((i) => i.id)).toEqual(["broken", "pretty"]);
  });

  it("drops duplicates by id or by the same words", () => {
    const { items } = selectBrief([c("a", "action", "estimate", "About 12 min"), c("a", "timely"), c("b", "timely", "listed", "about 12 min ")]);
    expect(items.map((i) => i.id)).toEqual(["a"]);
  });

  it("never pads: one candidate gives one item, none gives none", () => {
    expect(selectBrief([c("only", "secondary")]).items).toHaveLength(1);
    expect(selectBrief([]).items).toEqual([]);
  });
});

describe("briefLimitation", () => {
  it("names failed checks, keeping failed distinct from empty", () => {
    expect(briefLimitation({ failed: ["Help Points"], community: "failed" })).toBe("I couldn’t check Help Points and community information just now.");
    expect(briefLimitation({ failed: [], community: "none" })).toBe("I don’t have current community information for this place.");
    expect(briefLimitation({ failed: [], community: "some" })).toBeNull();
    expect(briefLimitation({ failed: [], community: "pending" })).toBeNull();
  });
});

describe("routeTimeLimitation", () => {
  it("never lets a route estimate stand for service at her time", () => {
    expect(routeTimeLimitation("transit", "11:00 PM")).toBe("This is a route estimate; I haven’t verified services at 11:00 PM.");
    expect(routeTimeLimitation("ride", null)).toMatch(/without live traffic/);
    expect(routeTimeLimitation("walk", "5:00 AM")).toBeNull();
  });
});

const delhi = { lat: 28.6951, lon: 77.2143 };
const at5am = new Date("2026-10-10T23:30:00Z"); // 5:00 AM IST on 11 Oct — before sunrise
const route = { route: { meters: 1200, minutes: 15, geometry: [], approximate: false, provider: "osm" }, lighting: null, helpPoints: [] };
const news: { evidence: { state: "ready"; sources: []; data: SafetyUpdatesData } } = { evidence: { state: "ready", sources: [], data: { updates: [{ id: "u1", category: "harassment", publisher: "Daily Example", publishedAt: new Date().toISOString() }], windowDays: 7 } as unknown as SafetyUpdatesData } };

describe("planBrief", () => {
  const claims = (extra: Claim[] = []): Claim[] => [
    walkTimeClaim(route, "walk", null, "Asia/Kolkata"),
    daylightClaim(at5am, delhi, "Asia/Kolkata", "when you set off"),
    helpClaim([], { state: "ready", sources: [], data: [] }, null),
    updatesClaim(news, "near there"),
    blindSpotsClaim("walk"),
    ...extra,
  ];

  it("never puts local news or 'what Mira can't see' into the short answer", () => {
    const { items } = planBrief(claims(), { mode: "walk", loop: false });
    expect(items.map((i) => i.id)).not.toContain("updates");
    expect(items.map((i) => i.id)).not.toContain("blind");
    expect(JSON.stringify(items)).not.toMatch(/report/i);
  });

  it("labels daylight as a calculation and leads with it before dawn, after the travel time", () => {
    const { items } = planBrief(claims(), { mode: "walk", loop: false });
    expect(items.map((i) => i.id)).toEqual(["time", "daylight"]);
    expect(items[1]).toMatchObject({ kind: "calculation", sourceLabel: "Solar calculation, not weather or visibility" });
    expect(items[1].text).toMatch(/^Dark when you set off/);
  });

  it("acknowledges an explicit constraint it cannot check instead of implying the route meets it", () => {
    const { items } = planBrief(claims(), { mode: "walk", loop: false, constraints: "step-free, well-lit" });
    expect(items[0]).toMatchObject({ id: "asked", kind: "unknown" });
    expect(items[0].text).toBe("You asked about “step-free” and “well-lit”. Mira has no source for that here, so this plan doesn’t account for it.");
    expect(items).toHaveLength(3);
  });

  it("puts the transit service caveat beside the travel time", () => {
    const { items } = planBrief([walkTimeClaim(route, "transit", null, "Asia/Kolkata")], { mode: "transit", loop: false, departClock: "11:00 PM" });
    expect(items[0]).toMatchObject({ id: "time", kind: "estimate", limitation: "This is a route estimate; I haven’t verified services at 11:00 PM." });
    expect(items[0].sourceLabel).toMatch(/not checked against timetables/);
  });

  it("keeps a missing loop as the first item, and never claims crowds or working lights", () => {
    const missing: Claim = { id: "route", kind: "none", topic: "Route", icon: "route", claim: "Mira can’t map a loop here yet — it only has a walking graph for a few areas." };
    const { items } = planBrief([missing, daylightClaim(at5am, delhi, "Asia/Kolkata", "for the whole of it")], { mode: "walk", loop: true });
    expect(items[0]).toMatchObject({ id: "route", kind: "unknown" });
    expect(JSON.stringify(items)).not.toMatch(/crowd|lamps work|safe/i);
  });

  it("states a failed check as failed, never as nothing found", () => {
    const failed = helpClaim([], { state: "failed", sources: [], retryable: true }, null);
    const { items, limitation } = planBrief([walkTimeClaim(route, "walk", null, null), failed, notesClaim("failed")!], { mode: "walk", loop: false });
    expect(items.map((i) => i.id)).toEqual(["time"]);
    expect(limitation).toBe("I couldn’t check Help Points and community information just now.");
  });

  it("leaves out checks still running instead of guessing", () => {
    const { items, limitation } = planBrief([walkTimeClaim(null, "walk", null, null), helpClaim([], undefined, null), updatesClaim(null)], { mode: "walk", loop: false });
    expect(items).toEqual([]);
    expect(limitation).toBe("I don’t have current community information for this place.");
    expect(planBrief([], { mode: "walk", loop: false, notesPending: true }).limitation).toBeNull();
  });
});

describe("departureForZone (A04/A29: the plan's time stays correct when the place's zone is learned)", () => {
  const now = new Date("2026-10-09T12:45:00Z");
  it("keeps 'now' the same instant when a UTC phone plans in Delhi", () => {
    expect(departureForZone("2026-10-09T12:45", "UTC", "Asia/Kolkata", now)).toBe("2026-10-09T18:15");
  });
  it("keeps a chosen later time's clock digits", () => {
    expect(departureForZone("2026-10-09T22:00", "UTC", "Asia/Kolkata", now)).toBe("2026-10-09T22:00");
  });
});
