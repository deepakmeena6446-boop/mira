/**
 * Country Context (blueprint §5H, intelligence doc Part A): what MIRA knows about the country
 * she is in — identity from the one country registry (data/countries/registry.json), emergency
 * numbers from cited, reviewed profiles (data/locales/<ISO>.json), and what MIRA can and cannot
 * check there — as one shape shared by the server, the screens and Mira.
 *
 * Knowing a country is not the same as knowing its emergency numbers: every one of the 195
 * states is in the registry, but a country without a reviewed profile is UNVERIFIED and has no
 * number. MIRA never guesses one, never falls back to 112/911 and never uses another country's.
 *
 * Client-safe: types and pure helpers only.
 */

export type EmergencyService = "police" | "ambulance" | "fire";
export const EMERGENCY_SERVICES: readonly EmergencyService[] = ["police", "ambulance", "fire"];

/**
 * How much of a country's emergency information MIRA has established from official sources.
 * - VERIFIED: police, ambulance and fire are each reachable on a nationally applicable number a cited official source states.
 * - PARTIALLY_VERIFIED: at least one cited number, but not every service is established (or a limitation is recorded).
 * - REGION_DEPENDENT: the sources say a service's number or availability differs by region.
 * - UNVERIFIED: no reviewed profile — MIRA shows no number.
 */
export type VerificationState = "VERIFIED" | "PARTIALLY_VERIFIED" | "REGION_DEPENDENT" | "UNVERIFIED";

export type CountryClassification = "un_member" | "un_observer_state" | "territory";

export interface EmergencyNumber {
  number: string;
  /** Plain English, e.g. "Emergency (police, fire, ambulance)". Single-service numbers name their service. */
  label: string;
  /** For single-service numbers (the UAE's 998 ambulance, Japan's 110 police…). */
  service?: EmergencyService;
  /** Only an explicitly reviewed all-service number can use the direct generic call action. */
  scope?: "all" | "service" | "unspecified";
  /** Qualification from the cited profile when operational coverage is not established. */
  qualification?: string;
  /** The services the cited source says this number reaches (empty = the source doesn't itemise them). */
  covers?: EmergencyService[];
  coverage?: "national" | "regional";
  verification?: VerificationState;
}

export interface Helpline {
  number: string;
  name: string;
  hours: string | null;
}

/**
 * What MIRA can check in a country, kept apart from emergency information: being in the
 * registry does not mean routes, lighting, Help Points or safety updates exist everywhere.
 */
export interface CountryCapabilities {
  emergency: VerificationState;
  /** The maps provider decides; some modes/areas have no route ("not known"). */
  routes: "provider_dependent";
  lighting: "source_dependent";
  helpPoints: "source_dependent";
  safetyUpdates: "source_dependent";
  communitySignals: "unavailable_in_beta";
}

export interface CountryContext {
  /** ISO 3166-1 alpha-2 from reverse geocoding; null until MIRA knows where she is. */
  iso: string | null;
  /** Canonical English name from the registry (or the runtime's region name outside it). */
  countryName: string | null;
  /** Registry classification; null when unknown or not in the registry. */
  classification: CountryClassification | null;
  /** ISO 3166-2 subdivision (e.g. IN-DL), when the provider gives one. */
  region: string | null;
  /** IANA time zone of the place when the profile has a single one; else null (use the phone's). */
  timezone: string | null;
  emergency: {
    status: VerificationState;
    /** Date the profile was last reviewed (YYYY-MM-DD); null without a profile. */
    reviewed: string | null;
    /** Known gaps, in plain words ("Fire: numbers listed per district municipality"). */
    limitations: string[];
    /** The number to dial in immediate danger. Null = MIRA doesn't know it for this country. */
    primary: EmergencyNumber | null;
    /** Other general emergency numbers that also work there (e.g. 112 in the UK). */
    also: EmergencyNumber[];
    /** Single-service numbers, when the profile lists them. */
    services: EmergencyNumber[];
    /** Where the primary number is stated officially (for "Where is this from?"). */
    source: { title: string; url: string } | null;
    /** ISO 3166-2 code of the regional override applied, if any. */
    regionOverride: string | null;
  };
  helplines: Helpline[];
  capabilities: CountryCapabilities;
}

export const NO_LOCAL_EMERGENCY_INFO = "Local emergency information has not yet been verified by MIRA.";

export function capabilitiesFor(emergency: VerificationState): CountryCapabilities {
  return { emergency, routes: "provider_dependent", lighting: "source_dependent", helpPoints: "source_dependent", safetyUpdates: "source_dependent", communitySignals: "unavailable_in_beta" };
}

export const UNKNOWN_COUNTRY: CountryContext = {
  iso: null,
  countryName: null,
  classification: null,
  region: null,
  timezone: null,
  emergency: { status: "UNVERIFIED", reviewed: null, limitations: [], primary: null, also: [], services: [], source: null, regionOverride: null },
  helplines: [],
  capabilities: capabilitiesFor("UNVERIFIED"),
};

/** One number's state: a regional number is REGION_DEPENDENT; a recorded limitation makes it partial. */
export function numberVerification(n: { coverage?: "national" | "regional"; limitation?: string }): VerificationState {
  return n.coverage === "regional" ? "REGION_DEPENDENT" : n.limitation ? "PARTIALLY_VERIFIED" : "VERIFIED";
}

/**
 * A country's (or region's) emergency status from its cited numbers. Only a number with no
 * limitation, national in coverage, counts towards VERIFIED; each of police, ambulance and fire
 * must be covered. Regional numbers or regionally organised services make it REGION_DEPENDENT.
 */
export function deriveEmergencyStatus(numbers: Array<{ covers: EmergencyService[]; verification: VerificationState }>, regionalServices: EmergencyService[] = []): VerificationState {
  if (!numbers.length) return "UNVERIFIED";
  const covered = new Set(numbers.filter((n) => n.verification === "VERIFIED").flatMap((n) => n.covers));
  if (EMERGENCY_SERVICES.every((s) => covered.has(s))) return "VERIFIED";
  if (regionalServices.length || numbers.some((n) => n.verification === "REGION_DEPENDENT")) return "REGION_DEPENDENT";
  return "PARTIALLY_VERIFIED";
}

/** How a number is presented: all-service, single-service, or not itemised by its source. */
export function numberScope(covers: EmergencyService[], verification: VerificationState): NonNullable<EmergencyNumber["scope"]> {
  if (covers.length === 1) return "service";
  return verification === "VERIFIED" && EMERGENCY_SERVICES.every((s) => covers.includes(s)) ? "all" : "unspecified";
}

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

/**
 * Why there is no number, in one sentence: MIRA can't tell the country, or it knows the country
 * but hasn't verified its numbers. Deterministic; the screens and Mira use the same words.
 */
export function noNumberReason(ctx: CountryContext): string {
  if (!ctx.iso) return "MIRA couldn't determine which country you're in, so it can't show a local emergency number.";
  return ctx.countryName ? `MIRA knows you're in ${ctx.countryName}, but hasn't yet verified its local emergency information.` : NO_LOCAL_EMERGENCY_INFO;
}

/**
 * The honest caveat to show beside the call options, or null when the country is fully verified.
 * Unverified: why there's no number. Partial / region-dependent: the status and its limits.
 */
export function emergencyStatusNote(ctx: CountryContext): string | null {
  const s = ctx.emergency.status;
  if (s === "VERIFIED" && ctx.emergency.primary) return null;
  if (!ctx.emergency.primary) return noNumberReason(ctx);
  const where = ctx.countryName ?? "this country";
  const limits = ctx.emergency.limitations.join(" ");
  return `MIRA's emergency information for ${where} ${s === "REGION_DEPENDENT" ? "depends on the region" : "is only partly verified"}.${limits ? ` ${limits}` : ""}`;
}

/** One factual line for Mira; no unsupported number or implied all-service coverage. */
export function emergencyLine(ctx: CountryContext): string {
  const actions = emergencyActions(ctx);
  if (!actions.length) return `Local emergency number: not known to MIRA for ${ctx.countryName ?? ctx.iso ?? "this location"} (${ctx.iso ? "emergency information not yet verified" : "country not determined"}).`;
  const status = ctx.emergency.status === "VERIFIED" ? "" : ` Status: ${statusWords(ctx.emergency.status)}.${ctx.emergency.limitations.length ? ` Limits: ${ctx.emergency.limitations.join(" ")}` : ""}`;
  return `Reviewed call options: ${actions.map((n) => `${n.number} (${n.label}${n.qualification ? `; ${n.qualification}` : ""})`).join("; ")}.${status}`;
}

export function statusWords(s: VerificationState): string {
  return { VERIFIED: "verified", PARTIALLY_VERIFIED: "partly verified", REGION_DEPENDENT: "depends on the region", UNVERIFIED: "not yet verified" }[s];
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
