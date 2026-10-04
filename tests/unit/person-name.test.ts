import { describe, expect, it } from "vitest";
import { cleanLabel, impersonates, personName, placeLabel } from "@/server/http/person-name";

const name = personName(40);
const ok = (v: string) => name.safeParse(v).success;

describe("names inside MIRA's own sentences (audit P17-001/P17-002)", () => {
  it("strip bidi overrides, zero-width and filler characters, and fold line separators, NEL and tabs into spaces", () => {
    expect(name.parse("\u202EP17-Asha")).toBe("P17-Asha");
    expect(name.parse("As\u200Bha\u2060")).toBe("Asha");
    expect(name.parse("Asha\u2028\u2028Rao")).toBe("Asha Rao");
    expect(name.parse("Asha\u0085Rao\tK")).toBe("Asha Rao K");
    expect(name.parse("Asha\u00A0Rao")).toBe("Asha Rao"); // a no-break space can't glue words into one "first name"
    expect(name.parse("\u0905\u0936\u093E")).toBe("\u0905\u0936\u093E"); // Devanagari stays as typed
    expect(cleanLabel("\u0915\u094D\u200D\u0937")).toBe("\u0915\u094D\u200D\u0937"); // ZWJ inside an Indic name is kept
  });

  it("refuse names with no visible letter", () => {
    for (const v of ["\u200B", "\u200D", "\u200C", "\u2060", "\u3164", "\u2800", "\u00AD", "\uFFA0", "112", "  "]) expect(ok(v), JSON.stringify(v)).toBe(false);
  });

  it("refuse MIRA, its team and emergency services, but not a person called Mira", () => {
    for (const v of ["MIRA", "MIRA team", "MIRA\u00A0team", "Mira team", "The MIRA Team", "Mira Support", "Asha from MIRA support", "Emergency", "Admin", "Police", "Support team", "no-reply"]) {
      expect(ok(v), v).toBe(false);
    }
    for (const v of ["Mira", "Meera", "Asha", "Asha Police", "Dev", "Priya Mira"]) expect(ok(v), v).toBe(true);
    expect(impersonates("Mira")).toBe(false);
  });

  it("refuse a domain of any TLD, look-alike dots included, and links and addresses as before", () => {
    for (const v of ["mirahelp.co", "mira-support.site", "mira\uFF0Ecom", "mira\u3002com", "Asha\u2028\u2028MIRA:\u00A0verify\u00A0at\u00A0mirahelp.co", "a@b", "http://x", "www.x", "<b>A</b>"]) {
      expect(ok(v), v).toBe(false);
    }
    expect(ok("A.R. Rahman")).toBe(true); // initials aren't a domain
    expect(ok("J.K.")).toBe(true);
  });

  it("still cap the length after cleaning", () => {
    expect(ok("a".repeat(40))).toBe(true);
    expect(ok("a".repeat(41))).toBe(false);
    expect(ok("\u200B".repeat(30) + "Asha")).toBe(true);
  });
});

describe("place labels (audit P19-002 uses the same defusing on a destination change)", () => {
  it("lose bidi and invisible characters and line separators, and are never refused", () => {
    const p = placeLabel(80);
    expect(p.parse("Gate 3\nURGENT: verify at https://p19-phish.example.com/login <b>now</b>")).toBe("Gate 3 URGENT: verify at p19-phish.example .com/login b now /b");
    expect(p.parse("\u202EHome\u2028Gate")).toBe("Home Gate");
    expect(p.parse("verify at mirahelp.co")).toBe("verify at mirahelp .co");
    expect(p.parse("\u200B")).toBe("Destination");
  });
});
