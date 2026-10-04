import { describe, expect, it } from "vitest";
import { blindSpotsClaim, hoursWords, notesClaim } from "@/lib/brief";

describe("a failed notes check is never shown as 'no notes' (audit L06-004)", () => {
  it("says it couldn't check, as a failed claim", () => {
    const c = notesClaim("failed", "around you");
    expect(c?.kind).toBe("failed");
    expect(c?.claim).toMatch(/couldn.t check/);
    expect(c?.claim).not.toMatch(/No released/);
  });
  it("leaves the row out while checking or when nothing is released (publishing is off in the beta)", () => {
    expect(notesClaim([], "around you")).toBeNull();
    expect(notesClaim(null)).toBeNull();
  });
  it("shows released notes as people evidence", () => {
    const note = { id: "n1", text: "Multiple reviewed observations mention poor lighting in this area during the evening.", polarity: "environmental" as const, timeBand: "evening", lat: 0, lon: 0, week: "2026-09-28" };
    expect(notesClaim([note], "around you")).toMatchObject({ kind: "people", claim: expect.stringContaining("1 note around you") });
  });
});

describe("limitations are said once, in plain words", () => {
  it("the one 'can't see' line names staffing, so rows don't repeat it", () => {
    const c = blindSpotsClaim("walk");
    expect(c.topic).toBe("What Mira can’t see");
    expect(c.claim).toMatch(/staffed/);
  });
  it("hours lead with the fact; listed hours keep a one-word qualifier unless the heading says it", () => {
    expect(hoursWords({ kind: "listed_open", closesAt: 21 * 60 } as Parameters<typeof hoursWords>[0])).toBe("open until 9 PM (listed)");
    expect(hoursWords({ kind: "listed_open", closesAt: 21 * 60 } as Parameters<typeof hoursWords>[0], { listed: false })).toBe("open until 9 PM");
    expect(hoursWords({ kind: "open_24h" } as Parameters<typeof hoursWords>[0])).toBe("open 24 hours (listed)");
  });
});
