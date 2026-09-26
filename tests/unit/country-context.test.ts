import { describe, expect, it } from "vitest";
import { countryContext, profiledCountries } from "@/server/locale";
import { emergencyDial, emergencyLine, UNKNOWN_COUNTRY } from "@/domain/country-context";

/**
 * Every cited profile in data/locales must load (a malformed file is a safety bug), and the
 * beta test countries must resolve to their own numbers — never to India's by default.
 */
describe("Country Context", () => {
  it("loads every profile and each one has a cited general number", () => {
    const isos = profiledCountries();
    expect(isos.length).toBeGreaterThanOrEqual(6);
    for (const iso of isos) {
      const c = countryContext(iso);
      expect(c.iso).toBe(iso);
      expect(c.emergency.primary?.number).toMatch(/^\d{2,6}$/);
      expect(c.emergency.source?.url).toMatch(/^https:\/\//);
    }
  });

  it.each([
    ["IN", "112"],
    ["GB", "999"],
    ["AE", "999"],
    ["US", "911"],
    ["KE", "999"],
    ["FR", "112"],
  ])("%s dials its own number %s", (iso, number) => {
    expect(emergencyDial(countryContext(iso))).toMatchObject({ number, known: true });
  });

  it("unknown countries have no number and say so", () => {
    const c = countryContext("AQ");
    expect(c.emergency.primary).toBeNull();
    expect(emergencyDial(c)).toMatchObject({ known: false });
    expect(emergencyLine(c)).toMatch(/not known to MIRA/);
    expect(emergencyDial(UNKNOWN_COUNTRY).known).toBe(false);
  });

  it("lists other official numbers without repeating the primary", () => {
    const gb = countryContext("GB");
    expect(gb.emergency.also.map((a) => a.number)).toContain("112");
    expect(gb.emergency.also.map((a) => a.number)).not.toContain("999");
    const ae = countryContext("AE");
    expect(ae.emergency.services.map((s) => s.number)).toEqual(expect.arrayContaining(["998", "997"]));
  });

  it("rejects malformed codes", () => {
    expect(countryContext("../etc").iso).toBeNull();
    expect(countryContext("in").iso).toBe("IN");
  });
});
