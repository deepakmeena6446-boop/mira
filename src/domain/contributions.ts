import { walkerVerdict, type LitVote, type WalkerCell } from "./lighting";

/**
 * Contributions: the community as a sensor network, never the source of truth (blueprint §7,
 * engine doc §6.5 / §11). Everything here is deterministic and pure:
 *
 *   contribution → pending signal → independent corroboration and/or provider agreement
 *   → verified signal → used → impact credit.
 *
 * A contribution never creates reputation on its own. Incident reports are a different system
 * (private, moderated) and are never part of this — nothing here knows they exist.
 */

// ── Vocabulary ──────────────────────────────────────────────────────────────────────

export const CLAIM_GROUPS = {
  open: ["open", "closed"],
  staffed: ["staffed", "unstaffed"],
  entrance: ["entrance_open", "entrance_closed"],
  exists: ["gone"],
  hours: ["hours_wrong"],
  kind: ["wrong_kind"],
} as const;
export type ClaimGroup = keyof typeof CLAIM_GROUPS;
export type PlaceClaim = (typeof CLAIM_GROUPS)[ClaimGroup][number];
export const PLACE_CLAIMS = Object.values(CLAIM_GROUPS).flat() as PlaceClaim[];

export function groupOf(claim: PlaceClaim): ClaimGroup {
  return (Object.keys(CLAIM_GROUPS) as ClaimGroup[]).find((g) => (CLAIM_GROUPS[g] as readonly string[]).includes(claim))!;
}

/** Only objective, observable questions. Never opinions about areas or people. */
export const CLAIM_LABEL: Record<PlaceClaim, string> = {
  open: "It was open",
  closed: "It was closed",
  staffed: "Staff were there",
  unstaffed: "No staff were there",
  entrance_open: "The entrance was open",
  entrance_closed: "The entrance was closed",
  gone: "The place is gone",
  hours_wrong: "The hours are wrong",
  wrong_kind: "It isn't this kind of place",
};

/** Structured corrections offered in "Correct something" (no free text, ever). */
export const CORRECTIONS = ["hours_wrong", "entrance_closed", "gone", "wrong_kind"] as const satisfies readonly PlaceClaim[];
export type Correction = (typeof CORRECTIONS)[number];
export const CORRECTION_LABEL: Record<Correction, string> = {
  hours_wrong: "The opening hours are wrong",
  entrance_closed: "The entrance is closed",
  gone: "The place has closed down or moved",
  wrong_kind: "It's not this kind of place",
};

/** Time-dependent claims are compared only at the same local weekday × time band. */
export const TIMED_GROUPS: readonly ClaimGroup[] = ["open", "staffed"];
export const isTimed = (claim: PlaceClaim) => TIMED_GROUPS.includes(groupOf(claim));

/** Validity window per claim group (engine doc §6.7): how far back signals are compared. */
export const WINDOW_DAYS: Record<ClaimGroup, number> = { open: 28, staffed: 28, entrance: 7, exists: 30, hours: 30, kind: 30 };
/** Lighting: the existing 90-day walker window (src/server/lighting). */
export const LIGHTING_WINDOW_DAYS = 90;
/** A pending receipt is decided by then at the latest (expired if nobody else confirmed). */
export const PENDING_MAX_DAYS = { place_status: 30, correction: 30, lighting: 90 } as const;

export type Band = "day" | "evening" | "late";
/** Local time bands, the same boundaries as reports: day 06–18, evening 18–22, late 22–06. */
export function bandForHour(hour: number): Band {
  return hour >= 6 && hour < 18 ? "day" : hour >= 18 && hour < 22 ? "evening" : "late";
}

/**
 * Local weekday (0 = Monday) and hour at `at`. With the journey's IANA zone when known;
 * otherwise mean solar time from the longitude (never a hardcoded country zone).
 */
export function localWhen(at: Date, tz: string | null, lon: number): { weekday: number; hour: number; minute: number } {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(at);
      const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
      const hour = Number(parts.find((p) => p.type === "hour")?.value);
      const minute = Number(parts.find((p) => p.type === "minute")?.value);
      if (wd >= 0 && Number.isFinite(hour) && Number.isFinite(minute)) return { weekday: wd, hour: hour % 24, minute };
    } catch {
      /* unknown zone: fall through */
    }
  }
  const local = new Date(at.getTime() + Math.round(lon / 15) * 3600_000);
  return { weekday: (local.getUTCDay() + 6) % 7, hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

// ── Corroboration ───────────────────────────────────────────────────────────────────

export interface PlaceSignal {
  claim: PlaceClaim;
  /** YYYY-MM-DD */
  day: string;
  weekday: number | null;
  band: Band | null;
  voter: string;
}

/** Claims that say the opposite of `claim` (disagreement → "reports differ"). */
export function opposing(claim: PlaceClaim): PlaceClaim[] {
  const group = CLAIM_GROUPS[groupOf(claim)] as readonly PlaceClaim[];
  const same = group.filter((c) => c !== claim);
  // Someone finding it open/staffed/entrance open contradicts "gone", and the other way round.
  const alive: PlaceClaim[] = ["open", "staffed", "entrance_open"];
  if (claim === "gone") return alive;
  if (alive.includes(claim)) return [...same, "gone"];
  return same;
}

/** Of all voices, this share must agree before a disagreement is outvoted (3 against 1). */
export const MAJORITY = 0.75;
/** Distinct voices needed without a provider (engine doc §6.5: place status ≥ 2). */
export const MIN_PLACE_VOICES = 2;

export type Outcome =
  | { state: "corroborated"; by: "corroboration" | "provider" }
  | { state: "contradicted" } // the opposite was corroborated
  | { state: "differ" } // credible voices disagree: say nothing / "reports differ"; nobody is credited
  | { state: "pending" };

function daysBetween(a: string, b: Date): number {
  return (b.getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000;
}

/**
 * The deterministic rule for one claim about one place. Signals are counted as distinct voices
 * (keyed voter hashes); the caller guarantees one voice per person per subject per window.
 * `provider`: whether the provider's listed hours agree (true), disagree (false) or say nothing (null)
 * — only meaningful for open/closed.
 */
export function evaluateClaim(
  claim: PlaceClaim,
  at: { weekday: number | null; band: Band | null },
  signals: PlaceSignal[],
  now: Date,
  provider: boolean | null = null,
): Outcome {
  const window = WINDOW_DAYS[groupOf(claim)];
  const timed = isTimed(claim);
  const against = opposing(claim);
  const relevant = signals.filter((s) => {
    if (daysBetween(s.day, now) > window) return false;
    // Timed claims compare only the same weekday × band; "gone" is compared with any sighting.
    if (timed && isTimed(s.claim)) return s.weekday === at.weekday && s.band === at.band;
    return true;
  });
  const voices = (cs: PlaceClaim[]) => new Set(relevant.filter((s) => cs.includes(s.claim)).map((s) => s.voter)).size;
  const pro = voices([claim]);
  const con = voices(against);
  // Conservative beta policy: independent opposing evidence means reports differ.
  if (pro >= 1 && con >= 1) return { state: "differ" };
  if (pro >= MIN_PLACE_VOICES) return { state: "corroborated", by: "corroboration" };
  if (con >= MIN_PLACE_VOICES) return { state: "contradicted" };
  if (pro >= 1 && provider === true && (claim === "open" || claim === "closed")) return { state: "corroborated", by: "provider" };
  return { state: "pending" };
}

/** Receipt decision from an outcome: differing reports credit nobody. */
export function receiptDecision(o: Outcome): { status: "verified"; by: "corroboration" | "provider" } | { status: "contradicted" } | null {
  if (o.state === "corroborated") return { status: "verified", by: o.by };
  if (o.state === "contradicted" || o.state === "differ") return { status: "contradicted" };
  return null;
}

/**
 * What the community currently says about one place (for Help Points, after the lead wires it).
 * Only corroborated claims are stated; disagreement is "reports differ". Never a single voice.
 */
export interface PlaceStatus {
  /** ≥ 2 independent people said it's gone (and nobody saw it open since). */
  gone: boolean;
  /** At the given weekday × band: "closed" corroborated. */
  closedAtThisTime: boolean;
  /** At the given weekday × band: "open" corroborated. */
  openAtThisTime: boolean;
  /** Corroborated in the last 7 days. */
  entranceClosed: boolean;
  hoursDisputed: boolean;
  wrongKind: boolean;
  /** Some claim group has credible disagreement. */
  reportsDiffer: boolean;
}

export function placeStatus(signals: PlaceSignal[], at: { weekday: number; band: Band }, now: Date): PlaceStatus {
  const is = (claim: PlaceClaim) => evaluateClaim(claim, at, signals, now).state === "corroborated";
  const differs = (claim: PlaceClaim) => evaluateClaim(claim, at, signals, now).state === "differ";
  return {
    gone: is("gone"),
    closedAtThisTime: is("closed"),
    openAtThisTime: is("open"),
    entranceClosed: is("entrance_closed"),
    hoursDisputed: is("hours_wrong"),
    wrongKind: is("wrong_kind"),
    reportsDiffer: (["open", "staffed", "entrance_open", "gone"] as PlaceClaim[]).some(differs),
  };
}

// ── Lighting (reuses the existing walker rule) ──────────────────────────────────────

/**
 * A lighting receipt is decided on the few street cells it samples, using EXACTLY the walker
 * rule the map uses (≥ 3 distinct voices, ≥ 60% agreement). Counts passed in must contain her
 * at most once per cell (the server removes her other weekly votes), so she can't corroborate herself.
 *  - lit / dark: verified when any sampled cell's verdict matches; contradicted when every cell with
 *    a verdict says the opposite;
 *  - partly: verified when the sampled cells include both a lit and a not-lit verdict.
 */
export function evaluateLighting(vote: LitVote, cells: WalkerCell[]): "verified" | "contradicted" | "pending" {
  const verdicts = cells.map((c) => walkerVerdict(c)).filter((v): v is "lit" | "dark" => v !== null);
  if (!verdicts.length) return "pending";
  if (vote === "partly") return verdicts.includes("lit") && verdicts.includes("dark") ? "verified" : "pending";
  if (verdicts.includes(vote)) return "verified";
  return verdicts.every((v) => v !== vote) ? "contradicted" : "pending";
}

/** Up to `max` cells spread evenly along a route (a receipt samples a few, never the whole path). */
export function sampleCells(cells: string[], max = 8): string[] {
  if (cells.length <= max) return [...cells];
  const out: string[] = [];
  for (let i = 0; i < max; i++) out.push(cells[Math.round((i * (cells.length - 1)) / (max - 1))]);
  return [...new Set(out)];
}

// ── MIRA Checks ─────────────────────────────────────────────────────────────────────

/** A Help Point counts as "passed" when it is this close to where the journey went. */
export const PASSED_WITHIN_M = 60;

export interface CheckCandidate {
  key: string;
  name: string;
  /** Whether the provider lists hours we understand (or 24/7). */
  hoursKnown: boolean;
  /** Community voices currently disagree about open/closed at this weekday × band. */
  contested: boolean;
  /** She already contributed about this place recently (one voice per window). */
  alreadyAnswered: boolean;
}

/**
 * At most one question per journey, chosen by the value of the answer (engine doc §11):
 * contested first, then unknown hours, then known hours (a confirmation of the listing).
 * At night a known-hours confirmation is worth less than "Was the way lit?", so it yields to it.
 */
export function chooseCheck(candidates: CheckCandidate[], night: boolean): CheckCandidate | null {
  const open = candidates.filter((c) => !c.alreadyAnswered);
  const rank = (c: CheckCandidate) => (c.contested ? 0 : !c.hoursKnown ? 1 : 2);
  const best = [...open].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))[0] ?? null;
  if (!best) return null;
  if (night && rank(best) === 2) return null;
  return best;
}

export const CHECK_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "unsure", label: "Didn't notice" },
] as const;
export type CheckAnswer = (typeof CHECK_OPTIONS)[number]["value"] | "skip";

export function checkQuestion(name: string): string {
  return `Was ${name.slice(0, 80)} open when you passed?`;
}
