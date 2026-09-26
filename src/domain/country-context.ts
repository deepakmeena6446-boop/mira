/**
 * Country Context (blueprint §5H, intelligence doc Part A): what MIRA knows about the country
 * she is in — ISO code, emergency numbers, helplines, time zone — as one shape shared by the
 * server, the screens and Mira. Every emergency number comes from a cited, reviewed profile in
 * data/locales/<ISO>.json. When there is no profile, `emergency.primary` is null and the app
 * says it doesn't know the local number: it never guesses and never silently uses India's.
 *
 * Client-safe: types and pure helpers only.
 */

export interface EmergencyNumber {
  number: string;
  /** Plain English, e.g. "Emergency (police, fire, ambulance)". */
  label: string;
  /** For single-service numbers (the UAE's 998 ambulance, Japan's 110 police…). */
  service?: "police" | "ambulance" | "fire";
}

export interface Helpline {
  number: string;
  name: string;
  hours: string | null;
}

export interface CountryContext {
  /** ISO 3166-1 alpha-2 from reverse geocoding; null until MIRA knows where she is. */
  iso: string | null;
  /** English country name when a profile exists. */
  countryName: string | null;
  /** ISO 3166-2 subdivision (e.g. IN-DL), when the provider gives one. */
  region: string | null;
  /** IANA time zone of the place when the profile has a single one; else null (use the phone's). */
  timezone: string | null;
  emergency: {
    /** The number to dial in immediate danger. Null = MIRA doesn't know it for this country. */
    primary: EmergencyNumber | null;
    /** Other general emergency numbers that also work there (e.g. 112 in the UK). */
    also: EmergencyNumber[];
    /** Single-service numbers, when the profile lists them. */
    services: EmergencyNumber[];
    /** Where the primary number is stated officially (for "Where is this from?"). */
    source: { title: string; url: string } | null;
  };
  helplines: Helpline[];
}

export const UNKNOWN_COUNTRY: CountryContext = {
  iso: null,
  countryName: null,
  region: null,
  timezone: null,
  emergency: { primary: null, also: [], services: [], source: null },
  helplines: [],
};

/**
 * What to say when MIRA doesn't know the local number. 112 and 911 are the numbers every
 * GSM/UMTS/LTE phone must treat as emergency numbers (3GPP TS 22.101 §10.1.1), so the phone
 * normally connects them to the local emergency service — but it is the phone network's
 * behaviour, not MIRA's knowledge of the country, and the copy says exactly that.
 */
export const GSM_EMERGENCY = {
  number: "112",
  standard: "3GPP TS 22.101 §10.1.1",
  explain:
    "MIRA doesn't know the emergency number for this country yet. Mobile phones are required to treat 112 as an emergency number, so most networks connect it to local emergency services. If you know the local number, use that.",
} as const;

/** The number the Emergency control dials, and whether MIRA actually knows it for this country. */
export function emergencyDial(ctx: CountryContext): { number: string; known: boolean; label: string } {
  const p = ctx.emergency.primary;
  return p ? { number: p.number, known: true, label: p.label } : { number: GSM_EMERGENCY.number, known: false, label: "Emergency" };
}

/** One line for Mira and for copy: what MIRA knows about emergency help here. */
export function emergencyLine(ctx: CountryContext): string {
  const p = ctx.emergency.primary;
  if (!p) return `Local emergency number: not known to MIRA for ${ctx.iso ?? "this location"} (112 is connected by most mobile networks).`;
  const other = otherEmergencyNumbers(ctx).map((n) => `${n.number} (${n.label})`);
  return `Local emergency number: ${p.number} (${p.label})${other.length ? `; also ${other.join(", ")}` : ""}.`;
}

/**
 * The country's other official numbers, besides the primary: numbers that also work and
 * single-service numbers, one row per number with the services merged ("Ambulance / Fire" for
 * Japan's 119). For the "I feel unsafe" sheet and Mira.
 */
export function otherEmergencyNumbers(ctx: CountryContext): EmergencyNumber[] {
  const out = new Map<string, EmergencyNumber>();
  for (const n of [...ctx.emergency.also, ...ctx.emergency.services]) {
    if (n.number === ctx.emergency.primary?.number) continue;
    const seen = out.get(n.number);
    out.set(n.number, seen ? { ...seen, label: seen.label.includes(n.label) ? seen.label : `${seen.label} / ${n.label}` } : { number: n.number, label: n.label });
  }
  return [...out.values()];
}
