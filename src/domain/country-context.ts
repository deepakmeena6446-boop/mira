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
  /** Only an explicitly reviewed all-service number can use the direct generic call action. */
  scope?: "all" | "service" | "unspecified";
  /** Qualification from the cited profile when operational coverage is not established. */
  qualification?: string;
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

/** An unknown country never acquires a number from application fallback logic. */
export function emergencyDial(ctx: CountryContext): { number: string | null; known: boolean; label: string } {
  const p = ctx.emergency.primary;
  return p ? { number: p.number, known: true, label: p.label } : { number: null, known: false, label: "Local number unverified" };
}

/** Distinct dial actions, keeping service labels when numbers share a dispatcher. */
export function emergencyActions(ctx: CountryContext): EmergencyNumber[] {
  const byNumber = new Map<string, EmergencyNumber>();
  for (const n of [ctx.emergency.primary, ...ctx.emergency.also, ...ctx.emergency.services]) {
    if (!n) continue;
    const previous = byNumber.get(n.number);
    if (!previous) byNumber.set(n.number, { ...n });
    else if (n.service && !previous.label.toLowerCase().includes(n.label.toLowerCase())) {
      byNumber.set(n.number, { ...previous, label: previous.scope === "all" ? previous.label : `${previous.label} / ${n.label}` });
    }
  }
  return [...byNumber.values()];
}

/** One factual line for Mira; no unsupported number or implied all-service coverage. */
export function emergencyLine(ctx: CountryContext): string {
  const actions = emergencyActions(ctx);
  if (!actions.length) return `Local emergency number: not known to MIRA for ${ctx.iso ?? "this location"}.`;
  return `Reviewed call options: ${actions.map((n) => `${n.number} (${n.label}${n.qualification ? `; ${n.qualification}` : ""})`).join("; ")}.`;
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
