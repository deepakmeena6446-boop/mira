/**
 * Proof of usefulness, not volume (blueprint §7, §16). Pure and deterministic.
 *
 * - Impact comes ONLY from verified receipts that count (the first verified contribution per
 *   subject per 30 days). Pending, differing, expired receipts never count. Incident reports are a
 *   separate system and never produce a receipt at all.
 * - No points, badges for volume, streaks or leaderboards. Copy states real verified counts only.
 * - Local Steward is not earned by counts: it needs sustained, corroborated, geographically
 *   diverse evidence on a durable, established account with no anomaly flags. It grants no power
 *   over truth: steward answers pass the same corroboration as everyone's.
 */

export type ReceiptKind = "lighting" | "place_status" | "correction";
export type ReceiptStatus = "pending" | "verified" | "contradicted" | "expired";

export interface ReceiptRow {
  kind: ReceiptKind;
  status: ReceiptStatus;
  counted: boolean;
  /** YYYY-MM-DD */
  day: string;
  areaKey: string | null;
}

export interface ImpactSummary {
  /** Verified and counted: what "You helped verify N pieces of local information" says. */
  verified: number;
  byKind: Record<ReceiptKind, number>;
  /** Waiting for someone else to confirm. */
  pending: number;
  /** Reports differed or the opposite was confirmed: nobody credited. */
  differed: number;
  /** Distinct days with a counted verified contribution. */
  activeDays: number;
  /** Distinct ~5 km areas with a counted verified contribution. */
  areas: number;
  /** Verified ÷ (verified + differed), over every decided receipt (null when none decided). */
  agreement: number | null;
  /** Anomaly flags (bursts, high disagreement). */
  flags: AnomalyFlag[];
}

export type AnomalyFlag = "burst" | "high_disagreement";

/** More contributions than this in one day is a burst (no person walks past that many places). */
export const BURST_PER_DAY = 25;
/** Disagreement above this share, once there are enough decided receipts, is flagged. */
export const DISAGREEMENT_FLAG = 0.5;
export const DISAGREEMENT_MIN_DECIDED = 6;

export function impactSummary(receipts: ReceiptRow[]): ImpactSummary {
  const counted = receipts.filter((r) => r.status === "verified" && r.counted);
  const verifiedAll = receipts.filter((r) => r.status === "verified").length;
  const differed = receipts.filter((r) => r.status === "contradicted").length;
  const decided = verifiedAll + differed;
  const perDay = new Map<string, number>();
  for (const r of receipts) perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1);
  const flags: AnomalyFlag[] = [];
  if ([...perDay.values()].some((n) => n > BURST_PER_DAY)) flags.push("burst");
  if (decided >= DISAGREEMENT_MIN_DECIDED && differed / decided > DISAGREEMENT_FLAG) flags.push("high_disagreement");
  return {
    verified: counted.length,
    byKind: {
      lighting: counted.filter((r) => r.kind === "lighting").length,
      place_status: counted.filter((r) => r.kind === "place_status").length,
      correction: counted.filter((r) => r.kind === "correction").length,
    },
    pending: receipts.filter((r) => r.status === "pending").length,
    differed,
    activeDays: new Set(counted.map((r) => r.day)).size,
    areas: new Set(counted.map((r) => r.areaKey).filter(Boolean)).size,
    agreement: decided ? verifiedAll / decided : null,
    flags,
  };
}

/** The one impact sentence. Real verified counts only; nothing when there's nothing. */
export function impactLine(s: ImpactSummary): string | null {
  if (!s.verified) return null;
  return `You helped verify ${s.verified} ${s.verified === 1 ? "piece" : "pieces"} of local information.`;
}

// ── Local Steward ───────────────────────────────────────────────────────────────────

export interface StewardThresholds {
  minVerified: number;
  minActiveDays: number;
  minAreas: number;
  /** 0–1 */
  minAgreement: number;
  minAccountDays: number;
}

/** Beta defaults (not final; overridable with STEWARD_* env vars, see src/server/contributions). */
export const DEFAULT_STEWARD: StewardThresholds = { minVerified: 25, minActiveDays: 10, minAreas: 3, minAgreement: 0.8, minAccountDays: 30 };

export interface StewardAccount {
  /** Email/Google sign-in: a first-name-only account can't be a steward. */
  durable: boolean;
  createdAt: Date;
}

export interface StewardStatus {
  steward: boolean;
  /** Plain-language list of what's still needed (empty when steward). */
  needs: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function stewardStatus(s: ImpactSummary, account: StewardAccount, t: StewardThresholds, now: Date): StewardStatus {
  const needs: string[] = [];
  if (!account.durable) needs.push("An email sign-in on this account, so it's one person you can come back to");
  const ageDays = Math.floor((now.getTime() - account.createdAt.getTime()) / 86_400_000);
  if (ageDays < t.minAccountDays) needs.push(`An account at least ${t.minAccountDays} days old (${plural(t.minAccountDays - ageDays, "day", "days")} to go)`);
  if (s.verified < t.minVerified) needs.push(`${plural(t.minVerified - s.verified, "more verified contribution", "more verified contributions")}`);
  if (s.activeDays < t.minActiveDays) needs.push(`Verified contributions on ${plural(t.minActiveDays - s.activeDays, "more day", "more days")}`);
  if (s.areas < t.minAreas) needs.push(`Verified contributions in ${plural(t.minAreas - s.areas, "more area", "more areas")}`);
  const pct = Math.round(t.minAgreement * 100);
  if (s.agreement === null || s.agreement < t.minAgreement) needs.push(`At least ${pct}% of your decided answers confirmed by others`);
  if (s.flags.length) needs.push("No unusual activity on the account (for example, very many answers in one day)");
  return { steward: needs.length === 0, needs };
}
