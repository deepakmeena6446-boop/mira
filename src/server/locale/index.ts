import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UNKNOWN_COUNTRY, type CountryContext, type EmergencyNumber } from "@/domain/country-context";

/**
 * Location Context (blueprint §5H, intelligence doc Part A): per-country profiles in
 * data/locales/<ISO>.json, every value cited to an official source with a retrieval date and
 * reviewed as a protected area. The country comes from reverse geocoding. With no profile,
 * `emergency.primary` is null and the app says it doesn't know the local number — it never
 * guesses one (data/locales/README.md).
 */
const source = z.object({ url: z.url(), title: z.string().min(1), retrieved: z.iso.date() }).passthrough();
const num = z.string().regex(/^\d{2,6}$/);
const profileSchema = z
  .object({
    iso: z.string().regex(/^[A-Z]{2}$/),
    name: z.string().min(1),
    version: z.string().min(1),
    // Omitted for countries with more than one time zone (the phone's own zone is used).
    timezone: z.string().min(1).optional(),
    emergency: z.object({
      general: z.object({ number: num, label: z.string().min(1), source }).passthrough(),
      also: z.array(z.object({ number: num, label: z.string().min(1), source }).passthrough()).optional(),
      services: z.array(z.object({ service: z.enum(["police", "ambulance", "fire"]), number: num, label: z.string().min(1), source }).passthrough()).optional(),
      women_helpline: z
        .array(z.object({ number: num, name: z.string().min(1), scope: z.string(), hours: z.string().optional(), notIn: z.array(z.string()).optional(), source }).passthrough())
        .optional(),
    }),
  })
  .passthrough();

type Profile = z.infer<typeof profileSchema>;

/** Every profile in data/locales, validated at first use; a malformed file fails loudly (a safety bug). */
function loadProfiles(): Record<string, Profile> {
  const dir = path.join(process.cwd(), "data", "locales");
  const out: Record<string, Profile> = {};
  for (const f of readdirSync(dir)) {
    if (!/^[A-Z]{2}\.json$/.test(f)) continue;
    const p = profileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
    if (`${p.iso}.json` !== f) throw new Error(`data/locales/${f}: iso ${p.iso} doesn't match the file name`);
    out[p.iso] = p;
  }
  return out;
}

let profiles: Record<string, Profile> | null = null;
function allProfiles(): Record<string, Profile> {
  profiles ??= loadProfiles();
  return profiles;
}

/** ISO codes with a reviewed profile (for tests, docs and Mira's "what I know"). */
export function profiledCountries(): string[] {
  return Object.keys(allProfiles()).sort();
}

/** The Country Context for a country (and optional ISO 3166-2 region). Unknown country → no number. */
export function countryContext(country: string | null | undefined, region?: string | null): CountryContext {
  const iso = country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
  const p = iso ? allProfiles()[iso] : undefined;
  if (!p) return { ...UNKNOWN_COUNTRY, iso, region: region ?? null };
  const e = p.emergency;
  const matchingService = (e.services ?? []).find((s) => s.number === e.general.number);
  const allServicesExplicit = /(?:police.*(?:fire|ambulance).*(?:fire|ambulance)|(?:fire|ambulance).*police.*(?:fire|ambulance))/i.test(e.general.label);
  const scope: EmergencyNumber["scope"] = matchingService ? "service" : allServicesExplicit ? "all" : "unspecified";
  const primary: EmergencyNumber = {
    number: e.general.number,
    label: matchingService ? matchingService.label : e.general.label,
    scope: p.iso === "NG" ? "unspecified" : scope,
    ...(p.iso === "NG" ? { qualification: "112 is a national number, but operational coverage in every area is not verified by MIRA" } : {}),
  };
  return {
    iso: p.iso,
    countryName: p.name,
    region: region ?? null,
    timezone: p.timezone ?? null,
    emergency: {
      primary,
      also: (e.also ?? []).filter((a) => a.number !== primary.number).map((a) => ({ number: a.number, label: a.label })),
      services: (e.services ?? []).map((s) => ({ number: s.number, label: s.label, service: s.service })),
      source: { title: e.general.source.title, url: e.general.source.url },
    },
    // A helpline that doesn't operate in her state isn't offered there (e.g. India's 181 outside West Bengal only).
    helplines: (e.women_helpline ?? []).filter((h) => !(region && h.notIn?.includes(region))).map((h) => ({ number: h.number, name: h.name, hours: h.hours ?? null })),
  };
}

/** @deprecated use countryContext — kept so older call sites read the same data. */
export const localeFor = countryContext;
