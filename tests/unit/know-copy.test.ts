import { describe, expect, it } from "vitest";
import { FORBIDDEN_VERDICT_WORDS, NO_COMMUNITY_STATEMENT, communityStatement, lightingFact, nearbyFacts, placeFacts, placeUnknowns, routeUnknowns } from "@/domain/know-copy";

const all = (xs: unknown) => JSON.stringify(xs);

describe("KNOW copy", () => {
  it("phrases OSM tags as mapped/listed facts", () => {
    const f = placeFacts("Pharmacy", { opening_hours: "Mo-Su 09:00-22:00" });
    expect(f[0].label).toBe("Mapped pharmacy");
    expect(f[1]).toMatchObject({ label: "Listed hours", value: "Mo-Su 09:00-22:00" });
    expect(f[1].note).toMatch(/may be outdated/i);
  });
  it("never turns missing lighting tags into a negative observation", () => {
    const f = lightingFact(0, 0, 500);
    expect(f.value).toMatch(/not recorded/);
    expect(f.note).toMatch(/Unrecorded is not the same as unlit/);
  });
  it("says 'no recent community observations' and never 'safe'", () => {
    expect(communityStatement("late", 0, 0)).toBe(NO_COMMUNITY_STATEMENT);
    expect(communityStatement("late", 0, 2)).toMatch(/don't describe late hours/);
    const text = all([NO_COMMUNITY_STATEMENT, communityStatement("day", 1, 0), placeUnknowns(true, "x"), routeUnknowns("x"), nearbyFacts({}, 40, "this route"), lightingFact(10, 20, 100)]);
    for (const re of FORBIDDEN_VERDICT_WORDS) expect(text).not.toMatch(re);
  });
});
