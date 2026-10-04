import { describe, expect, it } from "vitest";
import { compareWays, decisionTake } from "@/lib/decision-take";
import type { WayOption } from "@/lib/brief";
import type { HelpPoint } from "@/domain/help-points";

const way = (minutes: number, summary: { lit?: number; poles?: number; dark?: number; unknown?: number } | null, help = 0, approximate = false): WayOption => ({
  route: { meters: minutes * 80, minutes, geometry: [], approximate },
  lighting: summary && { segments: [], summary: { lit: 0, poles: 0, dark: 0, unknown: 0, ...summary }, confirmed: { lit: 0, dark: 0 }, sources: { walkers: false, osm: true, poles: false } },
  helpPoints: Array.from({ length: help }, (_, i) => ({ id: `h${i}` }) as unknown as HelpPoint),
});

describe("compareWays", () => {
  it("says nothing with one way", () => {
    expect(compareWays([way(10, { lit: 80, unknown: 20 })], 0)).toBeNull();
  });

  it("states a 20-point lighting gap against the fastest way, with the time it costs", () => {
    expect(compareWays([way(12, { lit: 38, dark: 40, unknown: 22 }), way(18, { lit: 52, poles: 20, unknown: 28 })], 1)).toBe(
      "This way has lighting mapped along about 70% of it; the fastest way, about 40%. It takes 6 min longer.",
    );
  });

  it("stays silent when the gap is under 20 points", () => {
    expect(compareWays([way(12, { lit: 55, unknown: 45 }), way(15, { lit: 70, unknown: 30 })], 1)).toBeNull();
  });

  it("stays silent when either way is more than half not known", () => {
    expect(compareWays([way(12, { lit: 30, unknown: 60 }), way(15, { lit: 80, unknown: 20 })], 1)).toBeNull();
    expect(compareWays([way(12, { lit: 30, unknown: 50 }), way(15, { lit: 80, unknown: 20 })], 1)).not.toBeNull();
  });

  it("never compares a straight-line estimate or a way with no lighting evidence", () => {
    expect(compareWays([way(12, { lit: 10, dark: 90 }, 0, true), way(15, { lit: 90, unknown: 10 })], 1)).toBeNull();
    expect(compareWays([way(12, null), way(15, { lit: 90, unknown: 10 })], 1)).toBeNull();
    expect(compareWays([way(12, { unknown: 40 }), way(15, { lit: 90, unknown: 10 })], 1)).toBeNull();
  });

  it("adds Help Points only when they differ by two or more", () => {
    expect(compareWays([way(12, { lit: 40, unknown: 10, dark: 50 }, 1), way(18, { lit: 70, unknown: 30 }, 3)], 1)).toBe(
      "This way has lighting mapped along about 70% of it; the fastest way, about 40%. It takes 6 min longer and passes 3 Help Points (fastest: 1).",
    );
    expect(compareWays([way(12, { lit: 40, unknown: 10, dark: 50 }, 1), way(18, { lit: 70, unknown: 30 }, 2)], 1)).not.toContain("Help Point");
  });

  it("from the fastest way, compares with the way that differs most", () => {
    const ways = [way(10, { lit: 30, dark: 50, unknown: 20 }, 1), way(13, { lit: 55, unknown: 45 }), way(16, { lit: 85, unknown: 15 }, 4)];
    expect(compareWays(ways, 0)).toBe("This way has lighting mapped along about 30% of it; another way, about 85%. It takes 6 min less and passes 1 Help Point (that way: 4).");
    expect(compareWays(ways.slice(0, 2), 0)).toBe("This way has lighting mapped along about 30% of it; the other way, about 55%. It takes 3 min less.");
  });

  it("says when the time is about the same, and never uses a verdict word", () => {
    const s = compareWays([way(12, { lit: 20, dark: 60, unknown: 20 }), way(12.4, { lit: 75, unknown: 25 })], 1);
    expect(s).toContain("It takes about the same time.");
    expect(s).not.toMatch(/\b(safe|safer|unsafe|dangerous|well-lit|deserted|better|best)\b/i);
  });
});

describe("decisionTake", () => {
  it("puts the comparison between daylight and Help Points", () => {
    const out = decisionTake({ departDaylight: "dark", arriveDaylight: "dark", ways: [way(12, { lit: 40, dark: 60 }), way(18, { lit: 70, unknown: 30 }, 2)], selected: 1, helpAt: null, loop: false });
    expect(out).toEqual([
      "It will be dark when you set off and when you arrive.",
      "This way has lighting mapped along about 70% of it; the fastest way, about 40%. It takes 6 min longer and passes 2 Help Points (fastest: 0).",
      "2 Help Points are on this way.",
    ]);
  });
});
