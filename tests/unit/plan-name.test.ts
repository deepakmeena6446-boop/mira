import { describe, expect, it } from "vitest";
import { newPlanDraft, type PlanDraft } from "@/domain/plan-state";
import { planLine, planStartsAt, planTitle, whenWords } from "@/domain/plan-name";

const now = new Date("2026-10-03T17:30:00Z"); // 11:00 PM in Asia/Kolkata
const base = (patch: Partial<PlanDraft> = {}): PlanDraft => ({ ...newPlanDraft(now, "Asia/Kolkata"), ...patch });
const place = (name: string) => ({ query: name, resolution: { source: "search" as const, name, point: { lat: 28.68, lon: 77.21 }, placeId: name } });

describe("plan identity", () => {
  it("names a plan by where it goes, a loop by what it is, and an empty plan honestly", () => {
    expect(planTitle(base({ destination: place("Hansraj College") }))).toBe("To Hansraj College");
    expect(planTitle(base({ loop: true, activity: "Evening walk", loopTarget: { kind: "duration", value: 45 } }))).toBe("Walk · 45 min");
    expect(planTitle(base({ loop: true }))).toBe("Run · 30 min");
    expect(planTitle(base())).toBe("A plan in progress");
  });

  it("leads the detail line with when, in the plan's own zone, then where it starts", () => {
    const draft = base({ origin: { kind: "named", ...place("Kamla Nagar") }, destination: place("Hansraj College"), departureLocal: "2026-10-04T21:00" });
    expect(planLine(draft, now)).toBe("Tomorrow, 9:00 PM · from Kamla Nagar");
    expect(planLine(base({ origin: { kind: "device", use: "from_here", point: { lat: 28.68, lon: 77.2 } }, departureLocal: "2026-10-03T23:00" }), now)).toBe("Now · from where you are");
  });

  it("says yesterday for a passed plan and orders plans by their real start", () => {
    expect(whenWords("2026-10-02T21:00", "Asia/Kolkata", now)).toBe("Yesterday, 9:00 PM");
    const early = base({ departureLocal: "2026-10-04T09:30" });
    const late = base({ departureLocal: "2026-10-04T21:00" });
    expect(planStartsAt(early)!).toBeLessThan(planStartsAt(late)!);
    expect(planStartsAt(base({ departureLocal: "" }))).toBeNull();
  });
});
