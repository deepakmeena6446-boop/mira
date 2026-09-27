// Deliberately not "server-only": tests and scripts/country-coverage.ts load fixture roots directly.
// It reads files under data/ and is only imported by server code.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  EMERGENCY_SERVICES,
  UNKNOWN_COUNTRY,
  capabilitiesFor,
  deriveEmergencyStatus,
  numberScope,
  numberVerification,
  type CountryClassification,
  type CountryContext,
  type EmergencyNumber,
  type EmergencyService,
  type VerificationState,
} from "@/domain/country-context";

/**
 * The one country registry (data/countries/registry.json: identity for all 195 states and the
 * few territories MIRA has profiles for) joined with the cited emergency profiles
 * (data/locales/<ISO>.json) and their regional overrides (data/locales/<ISO>-<SUB>.json).
 * Every value in a profile is cited (data/locales/README.md). A malformed file fails loudly:
 * a wrong emergency number is a safety bug.
 */

const SERVICE = z.enum(["police", "ambulance", "fire"]);
const STATE = z.enum(["VERIFIED", "PARTIALLY_VERIFIED", "REGION_DEPENDENT", "UNVERIFIED"]);
const source = z.object({ url: z.url(), title: z.string().min(1), retrieved: z.iso.date() }).passthrough();
const num = z.string().regex(/^\d{2,6}$/);
const coverageFields = { coverage: z.enum(["national", "regional"]).optional(), limitation: z.string().min(1).optional() };
const general = z.object({ number: num, label: z.string().min(1), covers: z.array(SERVICE), ...coverageFields, source }).passthrough();
const service = z.object({ service: SERVICE, number: num, label: z.string().min(1), ...coverageFields, source }).passthrough();
const regional = z.object({ service: SERVICE, note: z.string().min(1), source }).passthrough();
const helpline = z.object({ number: num, name: z.string().min(1), scope: z.string(), hours: z.string().optional(), notIn: z.array(z.string()).optional(), source }).passthrough();

const profileSchema = z
  .object({
    iso: z.string().regex(/^[A-Z]{2}$/),
    name: z.string().min(1),
    version: z.string().min(1),
    // Omitted for countries with more than one time zone (the phone's own zone is used).
    timezone: z.string().min(1).optional(),
    status: z.object({ emergency: STATE.exclude(["UNVERIFIED"]), reviewed: z.iso.date() }),
    emergency: z.object({
      general,
      also: z.array(general).optional(),
      services: z.array(service).optional(),
      regional: z.array(regional).optional(),
      women_helpline: z.array(helpline).optional(),
    }).passthrough(),
  })
  .passthrough();

/** A subdivision's differences from its country profile, each cited. Replaces same-service numbers. */
const overrideSchema = z
  .object({
    region: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/),
    name: z.string().min(1),
    version: z.string().min(1),
    reviewed: z.iso.date(),
    emergency: z.object({ general: general.optional(), also: z.array(general).optional(), services: z.array(service).optional(), regional: z.array(regional).optional() }).passthrough(),
  })
  .passthrough();

const registrySchema = z.object({
  version: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.url(), retrieved: z.iso.date() }).passthrough()).min(1),
  countries: z.array(
    z.object({
      iso2: z.string().regex(/^[A-Z]{2}$/),
      iso3: z.string().regex(/^[A-Z]{3}$/),
      name: z.string().min(1),
      aliases: z.array(z.string().min(1)),
      callingCode: z.string().regex(/^\+\d{1,3}(-\d{3})?$/),
      classification: z.enum(["un_member", "un_observer_state", "territory"]),
      parent: z.string().regex(/^[A-Z]{2}$/).optional(),
    }),
  ),
});

export type Profile = z.infer<typeof profileSchema>;
export type RegionOverride = z.infer<typeof overrideSchema>;
export type RegistryEntry = z.infer<typeof registrySchema>["countries"][number];

/** A single-service number names its own service and no other: never a generic "Emergency" label. */
const SERVICE_WORDS: Record<EmergencyService, RegExp> = {
  police: /police|garda|gendarmerie|polícia|policía/i,
  ambulance: /ambulance|medical/i,
  fire: /fire/i,
};
function checkLabel(where: string, label: string, covers: EmergencyService[]) {
  if (covers.length !== 1) return;
  const others = EMERGENCY_SERVICES.filter((s) => s !== covers[0]);
  if (!SERVICE_WORDS[covers[0]].test(label) || others.some((s) => SERVICE_WORDS[s].test(label))) throw new Error(`${where}: single-service (${covers[0]}) number labelled "${label}"`);
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

export interface CountryData {
  registry: RegistryEntry[];
  profiles: Record<string, Profile>;
  overrides: Record<string, RegionOverride>;
  countryContext(country: string | null | undefined, region?: string | null): CountryContext;
  /** Registry entry by ISO alpha-2/alpha-3, canonical name or alias (case- and accent-insensitive). */
  findCountry(query: string): RegistryEntry | null;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, "'").trim().toLowerCase();

/** Loads data/countries + data/locales under `root` (the repo's data/ directory by default). */
export function loadCountryData(root: string = path.join(process.cwd(), "data")): CountryData {
  const registry = registrySchema.parse(readJson(path.join(root, "countries", "registry.json"))).countries;
  const byIso = new Map(registry.map((c) => [c.iso2, c]));
  const lookup = new Map<string, RegistryEntry>();
  for (const c of registry) for (const k of [c.iso2, c.iso3, c.name, ...c.aliases]) lookup.set(fold(k), c);

  const dir = path.join(root, "locales");
  const profiles: Record<string, Profile> = {};
  const overrides: Record<string, RegionOverride> = {};
  // Missing profiles would make every country "number not known": a broken deploy, never a quiet degrade.
  if (!existsSync(dir)) throw new Error(`Country emergency profiles not found at ${dir} (deploy must include data/locales)`);
  for (const f of readdirSync(dir)) {
    if (/^[A-Z]{2}\.json$/.test(f)) {
      const p = profileSchema.parse(readJson(path.join(dir, f)));
      if (`${p.iso}.json` !== f) throw new Error(`data/locales/${f}: iso ${p.iso} doesn't match the file name`);
      if (!byIso.has(p.iso)) throw new Error(`data/locales/${f}: ${p.iso} is not in data/countries/registry.json`);
      for (const g of [p.emergency.general, ...(p.emergency.also ?? [])]) checkLabel(f, g.label, g.covers);
      for (const s of p.emergency.services ?? []) checkLabel(f, s.label, [s.service]);
      profiles[p.iso] = p;
    } else if (/^[A-Z]{2}-[A-Z0-9]{1,3}\.json$/.test(f)) {
      const o = overrideSchema.parse(readJson(path.join(dir, f)));
      if (`${o.region}.json` !== f) throw new Error(`data/locales/${f}: region ${o.region} doesn't match the file name`);
      for (const g of [...(o.emergency.general ? [o.emergency.general] : []), ...(o.emergency.also ?? [])]) checkLabel(f, g.label, g.covers);
      for (const s of o.emergency.services ?? []) checkLabel(f, s.label, [s.service]);
      overrides[o.region] = o;
    }
  }
  for (const r of Object.keys(overrides)) if (!profiles[r.slice(0, 2)]) throw new Error(`data/locales/${r}.json overrides a country with no profile`);

  function countryContext(country: string | null | undefined, region?: string | null): CountryContext {
    const iso = country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
    const reg = region && /^[A-Za-z]{2}-[A-Za-z0-9]{1,3}$/.test(region) ? region.toUpperCase() : null;
    if (!iso) return { ...UNKNOWN_COUNTRY, region: reg };
    const entry = byIso.get(iso);
    const base = { iso, countryName: entry?.name ?? regionName(iso), classification: (entry?.classification ?? null) as CountryClassification | null, callingCode: entry?.callingCode.replace("-", "") ?? null, region: reg };
    const p = profiles[iso];
    if (!p) return { ...UNKNOWN_COUNTRY, ...base };
    const o = reg && reg.startsWith(`${iso}-`) ? overrides[reg] : undefined;
    return { ...base, ...emergencyFor(p, o, reg) };
  }

  return {
    registry,
    profiles,
    overrides,
    countryContext,
    findCountry: (q) => lookup.get(fold(q)) ?? null,
  };
}

type Built = Pick<CountryContext, "timezone" | "emergency" | "helplines" | "capabilities">;

function emergencyFor(p: Profile, o: RegionOverride | undefined, region: string | null): Built {
  const e = p.emergency;
  const oe = o?.emergency;
  const g = oe?.general ?? e.general;
  const also = oe?.also ?? e.also ?? [];
  const overridden = new Set((oe?.services ?? []).map((s) => s.service));
  const services = [...(e.services ?? []).filter((s) => !overridden.has(s.service)), ...(oe?.services ?? [])];
  const regional = (oe?.regional ?? e.regional ?? []).filter((r) => !overridden.has(r.service));

  const asNumber = (n: z.infer<typeof general>): EmergencyNumber => {
    const verification = numberVerification(n);
    const covers = EMERGENCY_SERVICES.filter((s) => n.covers.includes(s));
    return {
      number: n.number,
      label: n.label,
      ...(covers.length === 1 ? { service: covers[0] } : {}),
      scope: numberScope(covers, verification),
      covers,
      coverage: n.coverage ?? "national",
      verification,
      ...(n.limitation ? { qualification: n.limitation } : {}),
    };
  };
  const serviceNumbers: EmergencyNumber[] = services.map((s) => {
    const verification = numberVerification(s);
    return { number: s.number, label: s.label, service: s.service, scope: "service", covers: [s.service], coverage: s.coverage ?? "national", verification, ...(s.limitation ? { qualification: s.limitation } : {}) };
  });

  const primary = asNumber(g);
  // Same number listed as a single service (Japan's 110 is "Police"): show the service's own label.
  const sameService = primary.covers?.length === 1 ? serviceNumbers.find((s) => s.number === primary.number && s.service === primary.service) : undefined;
  if (sameService) primary.label = sameService.label;
  const alsoNumbers = also.map(asNumber).filter((a) => a.number !== primary.number);

  const status: VerificationState = deriveEmergencyStatus(
    [primary, ...alsoNumbers, ...serviceNumbers].map((n) => ({ covers: n.covers ?? [], verification: n.verification ?? "UNVERIFIED" })),
    regional.map((r) => r.service),
  );
  const all = [primary, ...alsoNumbers, ...serviceNumbers];
  const unitemised = all.filter((n) => !n.covers?.length);
  const limitations = [
    ...all.filter((n) => n.qualification).map((n) => (n.qualification!.startsWith(n.number) ? n.qualification! : `${n.number}: ${n.qualification}`)),
    ...regional.map((r) => r.note),
    ...(status === "VERIFIED" ? [] : unitemised.map((n) => `${n.number}: the official source MIRA reviewed doesn't list which services it reaches.`)),
    ...(status === "VERIFIED" || unitemised.length ? [] : missingLine(EMERGENCY_SERVICES.filter((s) => !all.some((n) => n.covers?.includes(s)) && !regional.some((r) => r.service === s)))),
  ];

  return {
    timezone: p.timezone ?? null,
    emergency: {
      status,
      reviewed: o?.reviewed ?? p.status.reviewed,
      limitations: [...new Set(limitations)],
      primary,
      also: alsoNumbers,
      services: serviceNumbers,
      source: { title: g.source.title, url: g.source.url },
      regionOverride: o?.region ?? null,
    },
    // A helpline that doesn't operate in her state isn't offered there (e.g. India's 181 outside West Bengal only).
    helplines: (e.women_helpline ?? []).filter((h) => !(region && h.notIn?.includes(region))).map((h) => ({ number: h.number, name: h.name, hours: h.hours ?? null })),
    capabilities: capabilitiesFor(status),
  };
}

/** ["ambulance", "fire"] → ["MIRA has not verified an ambulance or fire number."] */
function missingLine(services: EmergencyService[]): string[] {
  if (!services.length) return [];
  const list = services.length === 1 ? services[0] : `${services.slice(0, -1).join(", ")} or ${services[services.length - 1]}`;
  return [`MIRA has not verified ${/^[aeiou]/.test(list) ? "an" : "a"} ${list} number.`];
}

/** "Peru" for "PE" from the runtime's region names, for a code outside the registry; null when unknown. */
function regionName(iso: string): string | null {
  try {
    const n = new Intl.DisplayNames(["en"], { type: "region" }).of(iso);
    return n && n !== iso ? n : null;
  } catch {
    return null;
  }
}

export interface EmergencyCoverage {
  /** Sovereign states in the registry (193 UN members + 2 observer states). */
  sovereign: number;
  byStatus: Record<VerificationState, string[]>;
  /** Non-sovereign registry entries (e.g. Hong Kong), reported separately. */
  territories: Array<{ iso: string; status: VerificationState }>;
}

/** Counts by emergency status, straight from what countryContext() returns — nothing rounded up. */
export function emergencyCoverage(d: CountryData): EmergencyCoverage {
  const byStatus: Record<VerificationState, string[]> = { VERIFIED: [], PARTIALLY_VERIFIED: [], REGION_DEPENDENT: [], UNVERIFIED: [] };
  const territories: EmergencyCoverage["territories"] = [];
  for (const c of d.registry) {
    const status = d.countryContext(c.iso2).emergency.status;
    if (c.classification === "territory") territories.push({ iso: c.iso2, status });
    else byStatus[status].push(c.iso2);
  }
  return { sovereign: d.registry.filter((c) => c.classification !== "territory").length, byStatus, territories };
}
