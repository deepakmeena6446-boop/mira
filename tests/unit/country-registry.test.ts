import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emergencyCoverage, loadCountryData } from "@/server/locale/data";
import { EMERGENCY_SERVICES, UNKNOWN_COUNTRY, emergencyActions, emergencyLine, noNumberReason, type VerificationState } from "@/domain/country-context";

/**
 * The country registry covers every sovereign state (193 UN members + Holy See + State of
 * Palestine), each with an explicit emergency status. The list below is typed out
 * independently of data/countries/registry.json so a dropped row fails here.
 */
const UN_MEMBERS = `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CR CI HR CU CY CZ KP CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA KR MD RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TH TL TG TO TT TN TR TM TV UG UA AE GB TZ US UY UZ VU VE VN YE ZM ZW`.split(" ");
const OBSERVERS = ["VA", "PS"];
const STATES: VerificationState[] = ["VERIFIED", "PARTIALLY_VERIFIED", "REGION_DEPENDENT", "UNVERIFIED"];
const FALLBACKS = /\b(112|911|999|000)\b/;

const d = loadCountryData();
const all = d.registry.map((c) => c.iso2);

describe("country registry", () => {
  it("has all 195 sovereign states, classified", () => {
    expect(UN_MEMBERS).toHaveLength(193);
    expect(new Set(UN_MEMBERS).size).toBe(193);
    for (const iso of UN_MEMBERS) expect(d.registry.find((c) => c.iso2 === iso)?.classification, iso).toBe("un_member");
    for (const iso of OBSERVERS) expect(d.registry.find((c) => c.iso2 === iso)?.classification, iso).toBe("un_observer_state");
    expect(d.registry.filter((c) => c.classification !== "territory")).toHaveLength(195);
  });

  it("has no duplicate ISO codes, names or aliases", () => {
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(d.registry.map((c) => c.iso3)).size).toBe(all.length);
    expect(new Set(d.registry.map((c) => c.name.toLowerCase())).size).toBe(all.length);
    const keys = d.registry.flatMap((c) => [c.iso2, c.iso3, c.name, ...c.aliases].map((k) => `${k.toLowerCase()}|${c.iso2}`));
    const owners = new Map<string, Set<string>>();
    for (const k of keys) {
      const [key, iso] = k.split("|");
      owners.set(key, (owners.get(key) ?? new Set()).add(iso));
    }
    expect([...owners].filter(([, s]) => s.size > 1).map(([k]) => k)).toEqual([]);
  });

  it("uses real ISO 3166-1 codes", () => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (const iso of all) expect(names.of(iso), iso).not.toBe(iso);
  });

  it("finds countries by code, name or alias", () => {
    expect(d.findCountry("UK")?.iso2).toBe("GB");
    expect(d.findCountry("Turkey")?.iso2).toBe("TR");
    expect(d.findCountry("türkiye")?.iso2).toBe("TR");
    expect(d.findCountry("Ivory Coast")?.iso2).toBe("CI");
    expect(d.findCountry("cote d’ivoire")?.iso2).toBe("CI");
    expect(d.findCountry("Vatican")?.iso2).toBe("VA");
    expect(d.findCountry("IND")?.iso2).toBe("IN");
    expect(d.findCountry("Atlantis")).toBeNull();
  });

  it("every profile is for a registry country", () => {
    for (const iso of Object.keys(d.profiles)) expect(all).toContain(iso);
  });
});

describe("emergency verification", () => {
  it("every country has an explicit status; no profile means UNVERIFIED with no number", () => {
    for (const iso of all) {
      const c = d.countryContext(iso);
      expect(STATES, iso).toContain(c.emergency.status);
      expect(c.capabilities.emergency).toBe(c.emergency.status);
      expect(c.countryName, iso).toBeTruthy();
      if (!d.profiles[iso]) {
        expect(c.emergency.status, iso).toBe("UNVERIFIED");
        expect(c.emergency.primary, iso).toBeNull();
        expect(emergencyActions(c), iso).toEqual([]);
      }
    }
  });

  it("each profile's declared status is what its cited numbers support", () => {
    for (const [iso, p] of Object.entries(d.profiles)) expect(d.countryContext(iso).emergency.status, iso).toBe(p.status.emergency);
  });

  it("every emergency number has an associated service or is an explicitly unitemised general number", () => {
    for (const iso of Object.keys(d.profiles)) {
      for (const n of emergencyActions(d.countryContext(iso))) {
        expect(n.covers, `${iso} ${n.number}`).toBeDefined();
        expect(n.verification, `${iso} ${n.number}`).toBeDefined();
        if (n.scope === "service") expect(n.covers).toHaveLength(1);
        if (n.scope === "all") expect(EMERGENCY_SERVICES.every((s) => n.covers!.includes(s)) && n.verification === "VERIFIED").toBe(true);
        if (!n.covers!.length) expect(n.scope, `${iso} ${n.number}`).toBe("unspecified");
      }
    }
  });

  it("VERIFIED profiles cite an official source for every number, with a review date", () => {
    for (const [iso, p] of Object.entries(d.profiles)) {
      if (p.status.emergency !== "VERIFIED") continue;
      expect(p.status.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const e = p.emergency;
      for (const n of [e.general, ...(e.also ?? []), ...(e.services ?? [])]) {
        expect(n.source.url, `${iso} ${n.number}`).toMatch(/^https:\/\//);
        expect(n.source.title.length, `${iso} ${n.number}`).toBeGreaterThan(0);
        expect(n.source.retrieved, `${iso} ${n.number}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("cites only reviewed official hosts (source hierarchy tiers 1-5; tier 6 needs a note)", () => {
    const reviewed = JSON.parse(readFileSync(path.join(process.cwd(), "data", "locales", "sources.json"), "utf8")) as { hosts: Record<string, { tier: number; note?: string }> };
    const cited = new Set<string>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") {
        const r = o as Record<string, unknown>;
        if (typeof r.url === "string" && typeof r.retrieved === "string") cited.add(new URL(r.url).hostname);
        Object.values(r).forEach(walk);
      }
    };
    Object.values(d.profiles).forEach(walk);
    Object.values(d.overrides).forEach(walk);
    expect([...cited].filter((h) => !reviewed.hosts[h]), "cited but not reviewed").toEqual([]);
    expect(Object.keys(reviewed.hosts).filter((h) => !cited.has(h)), "reviewed but no longer cited").toEqual([]);
    for (const [h, v] of Object.entries(reviewed.hosts)) {
      expect(v.tier, h).toBeGreaterThanOrEqual(1);
      expect(v.tier, h).toBeLessThanOrEqual(6);
      if (v.tier === 6) expect(v.note, h).toBeTruthy();
    }
  });

  it("service-specific numbers never carry a generic Emergency label", () => {
    const words = { police: /police|garda|gendarmerie|polícia|policía/i, ambulance: /ambulance|medical/i, fire: /fire/i };
    for (const iso of Object.keys(d.profiles)) {
      for (const n of emergencyActions(d.countryContext(iso))) {
        if (n.scope !== "service") continue;
        expect(n.label, `${iso} ${n.number}`).toMatch(words[n.service ?? n.covers![0]]);
      }
    }
    expect(() => loadCountryData(fixtureRoot({ label: "Emergency" }))).toThrow(/single-service/);
    expect(() => loadCountryData(fixtureRoot({ label: "Police and fire" }))).toThrow(/single-service/);
  });

  it("an unprofiled, unregistered or undetermined country never gains 112/911", () => {
    const unprofiled = all.filter((iso) => !d.profiles[iso]);
    expect(unprofiled.length).toBeGreaterThan(0);
    for (const iso of [...unprofiled, "PR", "TW", "AQ", "XK"]) {
      const c = d.countryContext(iso);
      expect(c.emergency.primary, iso).toBeNull();
      expect(emergencyLine(c), iso).not.toMatch(FALLBACKS);
      expect(noNumberReason(c), iso).not.toMatch(FALLBACKS);
    }
    expect(emergencyLine(UNKNOWN_COUNTRY)).toMatch(/country not determined/);
    expect(noNumberReason(UNKNOWN_COUNTRY)).toMatch(/couldn't determine which country/);
    expect(noNumberReason(d.countryContext("PE"))).toMatch(/in Peru, but hasn't yet verified its local emergency information/);
  });

  it("existing supported countries keep their numbers", () => {
    expect(Object.keys(d.profiles).length).toBeGreaterThanOrEqual(61);
    const expected: Record<string, string> = { IN: "112", US: "911", GB: "999", AE: "999", JP: "110", BR: "190", NG: "112", FR: "112", AU: "000", SG: "999", ZA: "10111" };
    for (const [iso, number] of Object.entries(expected)) expect(d.countryContext(iso).emergency.primary?.number, iso).toBe(number);
    expect(d.countryContext("NG").emergency.status).toBe("REGION_DEPENDENT");
    expect(d.countryContext("ZA").emergency.status).toBe("REGION_DEPENDENT");
    expect(d.countryContext("KE").emergency.status).toBe("PARTIALLY_VERIFIED");
    expect(d.countryContext("IN").emergency.status).toBe("VERIFIED");
  });

  it("reports coverage without rounding anything up", () => {
    const cov = emergencyCoverage(d);
    const counts = Object.fromEntries(Object.entries(cov.byStatus).map(([k, v]) => [k, v.length]));
    expect(cov.sovereign).toBe(195);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(195);
    expect(counts.UNVERIFIED).toBe(all.filter((iso) => !d.profiles[iso] && d.registry.find((c) => c.iso2 === iso)!.classification !== "territory").length);
    expect(cov.territories.map((t) => t.iso)).toEqual(["HK"]);
  });
});

describe("regional overrides", () => {
  const root = fixtureRoot({});
  const x = loadCountryData(root);

  it("a region-dependent country becomes verified where a cited override fills the gap", () => {
    expect(x.countryContext("XA").emergency.status).toBe("REGION_DEPENDENT");
    expect(x.countryContext("XA", "XA-S").emergency.status).toBe("REGION_DEPENDENT");
    const north = x.countryContext("XA", "XA-N");
    expect(north.emergency.status).toBe("VERIFIED");
    expect(north.emergency.regionOverride).toBe("XA-N");
    expect(north.emergency.services.find((s) => s.service === "fire")?.number).toBe("333");
    expect(north.emergency.limitations).toEqual([]);
  });

  it("an override replaces a same-service number and never leaks to another country", () => {
    expect(x.countryContext("XA", "XA-E").emergency.services.find((s) => s.service === "ambulance")?.number).toBe("444");
    expect(x.countryContext("XA", "XA-E").emergency.services.filter((s) => s.service === "ambulance")).toHaveLength(1);
    expect(x.countryContext("XB", "XA-N").emergency.primary).toBeNull();
    expect(x.countryContext("XB", "XA-N").emergency.regionOverride).toBeNull();
  });

  it("an override for a country without a profile is rejected", () => {
    expect(() => loadCountryData(fixtureRoot({ orphan: true }))).toThrow(/no profile/);
  });
});

/** A two-country world: XA (police + ambulance national, fire regional) and XB (no profile). */
function fixtureRoot(opts: { label?: string; orphan?: boolean }): string {
  const root = mkdtempSync(path.join(tmpdir(), "mira-countries-"));
  mkdirSync(path.join(root, "countries"));
  mkdirSync(path.join(root, "locales"));
  const src = { url: "https://example.gov/emergency", title: "Fixture source", retrieved: "2026-09-27" };
  const entry = (iso2: string, iso3: string, name: string) => ({ iso2, iso3, name, aliases: [], callingCode: "+999", classification: "un_member" });
  writeFileSync(path.join(root, "countries", "registry.json"), JSON.stringify({ version: "t", sources: [src], countries: [entry("XA", "XAA", "Fixtureland"), entry("XB", "XBB", "Otherland")] }));
  const w = (f: string, v: unknown) => writeFileSync(path.join(root, "locales", f), JSON.stringify(v));
  w("XA.json", {
    iso: "XA",
    name: "Fixtureland",
    version: "t",
    status: { emergency: "REGION_DEPENDENT", reviewed: "2026-09-27" },
    emergency: {
      general: { number: "111", label: opts.label ?? "Police", covers: ["police"], source: src },
      services: [{ service: "ambulance", number: "222", label: "Ambulance", source: src }],
      regional: [{ service: "fire", note: "Fire numbers differ by province.", source: src }],
    },
  });
  w("XA-N.json", { region: "XA-N", name: "North", version: "t", reviewed: "2026-09-27", emergency: { services: [{ service: "fire", number: "333", label: "Fire brigade", source: src }] } });
  w("XA-E.json", { region: "XA-E", name: "East", version: "t", reviewed: "2026-09-27", emergency: { services: [{ service: "ambulance", number: "444", label: "Ambulance (East)", source: src }] } });
  if (opts.orphan) w("XB-N.json", { region: "XB-N", name: "Orphan", version: "t", reviewed: "2026-09-27", emergency: { services: [{ service: "fire", number: "555", label: "Fire", source: src }] } });
  return root;
}
