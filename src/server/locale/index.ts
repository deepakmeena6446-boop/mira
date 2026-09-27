import "server-only";
import type { CountryContext } from "@/domain/country-context";
import { loadCountryData, type CountryData, type RegistryEntry } from "./data";

/**
 * Location Context (blueprint §5H, intelligence doc Part A). One registry of every country
 * (data/countries/registry.json) joined with cited emergency profiles (data/locales/<ISO>.json)
 * and regional overrides (data/locales/<ISO>-<SUB>.json). The country comes from reverse
 * geocoding. A country without a reviewed profile is known by name but UNVERIFIED: no number,
 * never a guess, never 112/911 as a "worldwide" fallback (data/locales/README.md).
 */
let data: CountryData | null = null;
function countryData(): CountryData {
  data ??= loadCountryData();
  return data;
}

/** ISO codes with a reviewed profile (for tests, docs and Mira's "what I know"). */
export function profiledCountries(): string[] {
  return Object.keys(countryData().profiles).sort();
}

/** Every registry entry (195 states plus territories with a profile). */
export function countryRegistry(): RegistryEntry[] {
  return countryData().registry;
}

/** Registry entry by ISO code, name or alias ("UK", "Türkiye", "Ivory Coast"); null when not found. */
export function findCountry(query: string): RegistryEntry | null {
  return countryData().findCountry(query);
}

/** The Country Context for a country (and optional ISO 3166-2 region). Unknown country → no number. */
export function countryContext(country: string | null | undefined, region?: string | null): CountryContext {
  return countryData().countryContext(country, region);
}

/** @deprecated use countryContext — kept so older call sites read the same data. */
export const localeFor = countryContext;
