import { describe, expect, it } from "vitest";
import { LOCAL_PERSONALISATION_KEYS, USAGE_KEY, computeMode, journeysStarted, localDay, recordUsage, resetLocalPersonalisation, usageMode, type UsageKind } from "@/lib/usage-signal";

/** An in-memory Storage (localStorage stand-in). */
function mem(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
const day = (d: string) => new Date(`${d}T12:00:00`);
const events = (spec: Array<[UsageKind, string]>) => spec;

describe("usage mode (07 §B.2)", () => {
  const now = day("2026-09-28");
  it("is cold with fewer than 3 events, and ignores Mira chat for the mode", () => {
    expect(computeMode(events([["journey", "2026-09-27"], ["journey", "2026-09-26"]]), now, undefined)).toBe("cold");
    expect(computeMode(events([["mira", "2026-09-27"], ["mira", "2026-09-27"], ["journey", "2026-09-26"]]), now, undefined)).toBe("cold");
  });
  it("journey-heavy, contribution-heavy and mixed", () => {
    const j = events([["journey", "2026-09-27"], ["journey", "2026-09-26"], ["journey", "2026-09-25"], ["report", "2026-09-24"]]);
    expect(computeMode(j, now, undefined)).toBe("journey");
    const c = events([["report", "2026-09-27"], ["check", "2026-09-26"], ["lit", "2026-09-25"], ["journey", "2026-09-24"]]);
    expect(computeMode(c, now, undefined)).toBe("contribute");
    const m = events([["report", "2026-09-27"], ["journey", "2026-09-26"], ["check", "2026-09-25"], ["journey", "2026-09-24"]]);
    expect(computeMode(m, now, undefined)).toBe("mixed");
  });
  it("has hysteresis: leaving journey for contribute needs 2.5×, staying needs only 1.5×", () => {
    // C:J = 2.2 (above 2, below 2.5)
    const e = events([["report", "2026-09-28"], ["report", "2026-09-28"], ["check", "2026-09-28"], ["check", "2026-09-28"], ["lit", "2026-09-28"], ["lit", "2026-09-28"], ["lit", "2026-09-28"], ["lit", "2026-09-28"], ["lit", "2026-09-28"], ["lit", "2026-09-28"], ["lit", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"]]);
    expect(computeMode(e, now, undefined)).toBe("contribute");
    expect(computeMode(e, now, "journey")).toBe("mixed");
    // Staying in journey with J:C = 1.6
    const stay = events([["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["journey", "2026-09-28"], ["report", "2026-09-28"], ["report", "2026-09-28"], ["report", "2026-09-28"], ["report", "2026-09-28"], ["report", "2026-09-28"]]);
    expect(computeMode(stay, now, "journey")).toBe("journey");
    expect(computeMode(stay, now, undefined)).toBe("mixed");
  });
  it("decays with a 21-day half-life and forgets anything older than 60 days", () => {
    // Four contributions from 6 weeks ago weigh 1.0 in total; three journeys from yesterday weigh ≈ 2.9.
    const e = events([["report", "2026-08-17"], ["report", "2026-08-17"], ["report", "2026-08-17"], ["report", "2026-08-17"], ["journey", "2026-09-27"], ["journey", "2026-09-27"], ["journey", "2026-09-27"]]);
    expect(computeMode(e, now, undefined)).toBe("journey");
    expect(computeMode(events([["report", "2026-07-01"], ["report", "2026-07-01"], ["report", "2026-07-01"]]), now, undefined)).toBe("cold");
  });
});

describe("usage storage", () => {
  it("records only kind + local date, capped at 60 events", () => {
    const s = mem();
    for (let i = 0; i < 70; i++) recordUsage("journey", day("2026-09-28"), s);
    const stored = JSON.parse(s.getItem(USAGE_KEY)!);
    expect(stored.events).toHaveLength(60);
    expect(stored.events[0]).toEqual(["journey", "2026-09-28"]);
    expect(JSON.stringify(stored)).not.toMatch(/lat|lon|T\d\d:/);
    expect(journeysStarted(day("2026-09-28"), s)).toBe(60);
  });
  it("keeps the same mode all day, even after new events (no rearranging while in use)", () => {
    const s = mem();
    for (const k of ["journey", "journey", "journey"] as const) recordUsage(k, day("2026-09-28"), s);
    expect(usageMode(day("2026-09-28"), s)).toBe("journey");
    for (let i = 0; i < 8; i++) recordUsage("report", day("2026-09-28"), s);
    expect(usageMode(day("2026-09-28"), s)).toBe("journey");
    expect(usageMode(day("2026-09-29"), s)).toBe("contribute");
  });
  it("is cold when storage is unavailable, and never throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    expect(() => recordUsage("report", day("2026-09-28"), broken)).not.toThrow();
    expect(usageMode(day("2026-09-28"), broken)).toBe("cold");
    expect(() => resetLocalPersonalisation(broken)).not.toThrow();
  });
  it("reset clears every device-local personalisation key", () => {
    const s = mem();
    for (const k of LOCAL_PERSONALISATION_KEYS) s.setItem(k, "1");
    s.setItem("mira.welcomed", "1");
    resetLocalPersonalisation(s);
    for (const k of LOCAL_PERSONALISATION_KEYS) expect(s.getItem(k)).toBeNull();
    expect(s.getItem("mira.welcomed")).toBe("1");
  });
  it("uses her local calendar date", () => {
    expect(localDay(new Date(2026, 8, 3, 23, 30))).toBe("2026-09-03");
  });
});
