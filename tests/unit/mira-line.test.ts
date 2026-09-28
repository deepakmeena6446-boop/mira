import { describe, expect, it } from "vitest";
import { companionOutputIssue } from "@/domain/companion-output";
import { homeLine, lightingClause, routeLine, tripLine, type HomeLineInput, type RouteLineInput } from "@/domain/mira-line";
import type { RouteLighting } from "@/domain/lighting";

const base: HomeLineInput = {
  signedIn: true,
  greeting: "Good evening, Asha",
  firstName: "Asha",
  late: false,
  night: false,
  hasLocation: true,
  habit: null,
  home: { label: "Home" },
  readyCheck: null,
  newlyVerified: false,
  scoutNew: false,
  circleCount: 1,
  journeysStarted: 2,
  usage: "cold",
};
const habit = { placeLabel: "Home", mode: "walk", times: 4 };
const lighting = (lit: number, unknown: number, dark = 0, poles = 0): RouteLighting => ({ segments: [], summary: { lit, poles, dark, unknown }, confirmed: { lit: 0, dark: 0 }, sources: { walkers: false, osm: true, poles: false } });
const route: RouteLineInput = { loading: false, minutes: 16, approximate: false, arriveAt: "11:00 pm", failed: false, tooFar: false, lighting: lighting(70, 30), helpCount: 3, helpFirstMinutes: 7 };

describe("homeLine — the adaptive Home sentence (07 §A.2)", () => {
  it("signed out: what Mira can do, no account needed", () => {
    expect(homeLine({ ...base, signedIn: false }).key).toBe("signed-out");
  });
  it("a habit leads for journey-heavy and cold users, with Go with Mira", () => {
    const l = homeLine({ ...base, habit, readyCheck: "Apollo Pharmacy", usage: "journey" });
    expect(l.key).toMatch(/^habit:/);
    expect(l.text).toBe("Heading to Home? You usually walk there around this time.");
    expect(l.action?.label).toBe("Go with Mira");
  });
  it("by day, a contributor sees the ready check before the habit", () => {
    expect(homeLine({ ...base, habit, readyCheck: "Apollo Pharmacy", usage: "contribute" }).key).toBe("check:Apollo Pharmacy");
  });
  it("after dark the way home outranks contribution, even for a contributor", () => {
    expect(homeLine({ ...base, habit, readyCheck: "Apollo Pharmacy", usage: "contribute", night: true }).key).toMatch(/^habit:/);
    expect(homeLine({ ...base, readyCheck: "Apollo Pharmacy", usage: "contribute", late: true }).key).toBe("late-home");
  });
  it("becoming a Mira Scout is said once, before anything else", () => {
    expect(homeLine({ ...base, habit, scoutNew: true }).key).toBe("scout");
  });
  it("a newly confirmed answer closes the loop", () => {
    expect(homeLine({ ...base, newlyVerified: true }).key).toBe("verified");
  });
  it("cold start: save Home, then add someone, then a plain greeting", () => {
    expect(homeLine({ ...base, home: null }).key).toBe("find-home");
    expect(homeLine({ ...base, circleCount: 0 }).key).toBe("add-circle");
    expect(homeLine({ ...base, circleCount: 0, journeysStarted: 0 }).text).toBe("Good evening, Asha. Where to?");
  });
  it("a habit needs her location (the walk starts from where she is)", () => {
    expect(homeLine({ ...base, habit, hasLocation: false }).key).not.toMatch(/^habit:/);
  });
});

describe("routeLine — conclusion before evidence (06 §3.4)", () => {
  it("states time, a lighting share and Help Points", () => {
    expect(routeLine(route).text).toBe("16 min walk, arrive around 11:00 pm. Most of it is mapped as lit. 3 Help Points on the way, the first 7 min in.");
  });
  it("keeps unknown, empty, failed and unavailable distinct", () => {
    expect(lightingClause(null)).toBe("Lighting on this way isn't mapped.");
    expect(lightingClause(lighting(10, 90))).toBe("Most of it isn't mapped for lighting.");
    expect(lightingClause(lighting(50, 50))).toBe("About half is mapped as lit.");
    expect(lightingClause(lighting(10, 40, 50))).toBe("Little of it is mapped as lit.");
    expect(lightingClause(null, { state: "failed", sources: [], retryable: true })).toBe("Couldn't check lighting right now.");
    expect(lightingClause(null, { state: "unavailable", sources: [], retryable: false })).toBe("Lighting evidence isn't available for this way.");
    expect(routeLine({ ...route, helpCount: 0 }).text).toContain("No Help Points found on the way.");
    expect(routeLine({ ...route, helpState: "failed" }).text).toContain("Couldn't check Help Points.");
  });
  it("loading thinks; approximate and failed say what isn't known", () => {
    expect(routeLine({ ...route, loading: true }).state).toBe("thinking");
    expect(routeLine({ ...route, approximate: true }).text).toContain("lighting and Help Points aren't known");
    expect(routeLine({ ...route, failed: true }).text).toBe("Couldn't get the walking time. You can still go with Mira.");
  });
  it("says who'll follow, like last time", () => {
    expect(routeLine({ ...route, likeLastTime: "Priya" }).text).toContain("Like last time, Priya will be able to follow.");
  });
});

describe("tripLine — who can see her, never more than is true", () => {
  it("names people only when their link went out", () => {
    expect(tripLine({ autoArrival: true, following: ["Mum"], whatsapp: [], attention: false }).text).toBe("Mum can see where you are until you arrive.");
    expect(tripLine({ autoArrival: true, following: [], whatsapp: ["Priya"], attention: false }).text).toBe("Send Priya your live link, and they can follow until you arrive.");
    expect(tripLine({ autoArrival: false, following: [], whatsapp: [], attention: true })).toMatchObject({ state: "attention", text: "Only people you send your live link to can follow." });
  });
});

describe("no Mira line ever carries a safety verdict or an unsupported promise", () => {
  it("passes every template through the companion output guard", () => {
    const lines = [
      homeLine({ ...base, signedIn: false }),
      homeLine({ ...base, habit }),
      homeLine({ ...base, habit: { ...habit, mode: "ride" } }),
      homeLine({ ...base, readyCheck: "Apollo Pharmacy", usage: "contribute" }),
      homeLine({ ...base, late: true }),
      homeLine({ ...base, newlyVerified: true }),
      homeLine({ ...base, scoutNew: true }),
      homeLine({ ...base, home: null }),
      homeLine({ ...base, circleCount: 0 }),
      homeLine({ ...base, circleCount: 0, journeysStarted: 0 }),
      routeLine(route),
      routeLine({ ...route, lighting: lighting(10, 40, 50) }),
      routeLine({ ...route, approximate: true }),
      routeLine({ ...route, failed: true }),
      routeLine({ ...route, helpState: "failed", lightingEvidence: { state: "failed", sources: [], retryable: true } }),
      routeLine({ ...route, likeLastTime: "Mum and Priya" }),
      tripLine({ autoArrival: true, following: ["Mum"], whatsapp: [], attention: false }),
      tripLine({ autoArrival: true, following: [], whatsapp: ["Priya"], attention: false }),
      tripLine({ autoArrival: false, following: [], whatsapp: [], attention: false }),
    ];
    for (const l of lines) {
      expect(companionOutputIssue(l.text, []), l.text).toBeNull();
      if (l.why) expect(companionOutputIssue(l.why, []), l.why).toBeNull();
      expect(l.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
