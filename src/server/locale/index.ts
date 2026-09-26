import "server-only";
import { z } from "zod";
import IN from "../../../data/locales/IN.json";
import { EMERGENCY_NUMBER } from "@/domain/emergency";

/**
 * Location Context (blueprint §5H, intelligence doc Part A): per-country profiles in
 * data/locales/<ISO>.json, every value cited to an official source with a retrieval date and
 * reviewed as a protected area. The country comes from reverse geocoding. With no profile,
 * the app still shows 112 (it works on most mobile networks) and says the number isn't
 * confirmed for that country — honest, and still one tap.
 */
const source = z.object({ url: z.url(), title: z.string().min(1), retrieved: z.iso.date() }).passthrough();
const profileSchema = z
  .object({
    iso: z.string().regex(/^[A-Z]{2}$/),
    name: z.string().min(1),
    version: z.string().min(1),
    timezone: z.string().min(1),
    emergency: z.object({
      general: z.object({ number: z.string().regex(/^\d{2,4}$/), label: z.string().min(1), source }),
      women_helpline: z.array(
        z.object({ number: z.string().regex(/^\d{2,6}$/), name: z.string().min(1), scope: z.string(), hours: z.string().optional(), notIn: z.array(z.string()).optional(), source }),
      ),
    }),
  })
  .passthrough();

type Profile = z.infer<typeof profileSchema>;
const PROFILES: Record<string, Profile> = Object.fromEntries([IN].map((p) => profileSchema.parse(p)).map((p) => [p.iso, p]));

export interface LocaleInfo {
  /** Country code, or null when not known yet. */
  iso: string | null;
  emergency: { number: string; label: string };
  /** True when the number comes from a reviewed profile for this country. */
  confirmed: boolean;
  helplines: Array<{ number: string; name: string; hours: string | null }>;
  timezone: string | null;
}

export function localeFor(country: string | null | undefined, region?: string | null): LocaleInfo {
  const p = country ? PROFILES[country.toUpperCase()] : undefined;
  if (!p) return { iso: country?.toUpperCase() ?? null, emergency: { number: EMERGENCY_NUMBER, label: "Emergency" }, confirmed: false, helplines: [], timezone: null };
  return {
    iso: p.iso,
    emergency: { number: p.emergency.general.number, label: p.emergency.general.label },
    confirmed: true,
    // A helpline that doesn't operate in her state isn't offered there (e.g. 181 outside West Bengal only).
    helplines: p.emergency.women_helpline.filter((h) => !(region && h.notIn?.includes(region))).map((h) => ({ number: h.number, name: h.name, hours: h.hours ?? null })),
    timezone: p.timezone,
  };
}

/** The profile MIRA falls back to for time formatting where no place is known (India first). */
export const DEFAULT_TIMEZONE = PROFILES.IN.timezone;
