/**
 * Weekly community aggregation (architecture §5, product spec §6). Pure: the caller
 * supplies eligible structured reports and prior release contributor sets.
 *
 *  - Key: fixed 500 m cell × IST time band × category. Unrelated categories are never
 *    combined to reach the threshold.
 *  - Eligible: approved, not withdrawn, band ≠ unsure, recency in today/yesterday/past
 *    week, submitted within the 21 days before release (so events fall in 28 days).
 *  - Independence: duplicate groups collapse to one; each actor counts once.
 *  - Threshold: ≥ 5 independent contributors; a changed release for a key needs ≥ 5
 *    contributors who were not in that key's most recent release.
 *  - Bursts: if most contributions landed within one short window the key is held.
 *  - Output: fixed factual template; no counts, narratives, points or exact times.
 */
import type { Category } from "./report/taxonomy";
import { CATEGORY_POLARITY, TAG_PHRASE, type Polarity } from "./report/taxonomy";
import type { TimeBand } from "./time-bands";

export const MIN_CONTRIBUTORS = 5;
export const MIN_NEW_CONTRIBUTORS = 5;
export const ELIGIBLE_SUBMISSION_DAYS = 21;
export const RELEASE_TTL_DAYS = 35;
export const BURST_WINDOW_HOURS = 2;
export const BURST_SHARE = 0.8;
export const MAX_TAGS_IN_COPY = 2;

/** Categories with a factual public template. "other" has none and stays private. */
const CATEGORY_PHRASE: Partial<Record<Category, string>> = {
  harassment: "harassment",
  following_stalking: "people being followed",
  unwanted_touching: "unwanted touching",
  threatening_behaviour: "threatening behaviour",
  transport_issue: "transport problems",
  environment: "problems with the street environment",
  positive_condition: "positive conditions",
};

const BAND_PHRASE: Record<TimeBand, string> = { day: "the day", evening: "the evening", late: "late hours" };

export interface EligibleReport {
  reportId: string;
  actorHash: string;
  duplicateGroup: string | null;
  cellId: string;
  timeBand: string;
  category: Category;
  recency: string;
  tags: string[];
  submittedAt: Date;
}

export interface KeyedRelease {
  key: string;
  cellId: string;
  timeBand: TimeBand;
  category: Category;
  polarity: Polarity;
  tags: string[];
  copy: string;
  contributors: string[]; // actor hashes (private)
  reportIds: string[]; // private
}

export type SkipReason = "below_threshold" | "not_enough_new_contributors" | "burst_hold" | "no_template";

export function releaseKey(cellId: string, band: string, category: string): string {
  return `${cellId}|${band}|${category}`;
}

export function isEligible(r: EligibleReport, releaseAt: Date): boolean {
  if (!["day", "evening", "late"].includes(r.timeBand)) return false;
  if (!["today", "yesterday", "past_week"].includes(r.recency)) return false;
  const age = releaseAt.getTime() - r.submittedAt.getTime();
  return age >= 0 && age <= ELIGIBLE_SUBMISSION_DAYS * 86_400_000;
}

export function releaseCopy(category: Category, band: TimeBand, tags: string[]): string | null {
  const phrase = CATEGORY_PHRASE[category];
  if (!phrase) return null;
  const tagPhrases = tags.slice(0, MAX_TAGS_IN_COPY).map((t) => TAG_PHRASE[t]).filter(Boolean);
  const subject = tagPhrases.length ? tagPhrases.join(" and ") : phrase;
  return `Multiple reviewed observations mention ${subject} in this area during ${BAND_PHRASE[band]}.`;
}

/** Collapse duplicate groups, then keep one representative report per actor. */
export function independentContributions(reports: EligibleReport[]): EligibleReport[] {
  const byGroup = new Map<string, EligibleReport>();
  for (const r of [...reports].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime() || a.reportId.localeCompare(b.reportId))) {
    const g = r.duplicateGroup ?? r.reportId;
    if (!byGroup.has(g)) byGroup.set(g, r);
  }
  const byActor = new Map<string, EligibleReport>();
  for (const r of byGroup.values()) if (!byActor.has(r.actorHash)) byActor.set(r.actorHash, r);
  return [...byActor.values()];
}

/** True when at least BURST_SHARE of contributions fall inside one BURST_WINDOW. */
export function isBurst(reports: EligibleReport[]): boolean {
  if (reports.length < MIN_CONTRIBUTORS) return false;
  const times = reports.map((r) => r.submittedAt.getTime()).sort((a, b) => a - b);
  const win = BURST_WINDOW_HOURS * 3600_000;
  let best = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] > win) j++;
    best = Math.max(best, i - j + 1);
  }
  return best / times.length >= BURST_SHARE;
}

export interface ComputeResult {
  releases: KeyedRelease[];
  skipped: Array<{ key: string; reason: SkipReason }>;
}

/**
 * @param previous most recent release contributor set per key (active or expired)
 */
export function computeReleases(reports: EligibleReport[], releaseAt: Date, previous: Map<string, Set<string>>): ComputeResult {
  const byKey = new Map<string, EligibleReport[]>();
  for (const r of reports) {
    if (!isEligible(r, releaseAt)) continue;
    const k = releaseKey(r.cellId, r.timeBand, r.category);
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }
  const releases: KeyedRelease[] = [];
  const skipped: ComputeResult["skipped"] = [];
  for (const [key, list] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
    const [cellId, band, category] = key.split("|") as [string, TimeBand, Category];
    const contributions = independentContributions(list);
    if (contributions.length < MIN_CONTRIBUTORS) {
      skipped.push({ key, reason: "below_threshold" });
      continue;
    }
    const prior = previous.get(key);
    if (prior) {
      const fresh = contributions.filter((c) => !prior.has(c.actorHash));
      if (fresh.length < MIN_NEW_CONTRIBUTORS) {
        skipped.push({ key, reason: "not_enough_new_contributors" });
        continue;
      }
    }
    if (isBurst(contributions)) {
      skipped.push({ key, reason: "burst_hold" });
      continue;
    }
    // Each tag is thresholded on its own so a tag never describes fewer than five people.
    const tagCounts = new Map<string, number>();
    for (const c of contributions) for (const t of new Set(c.tags)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const tags = [...tagCounts]
      .filter(([, n]) => n >= MIN_CONTRIBUTORS)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
    const copy = releaseCopy(category, band, tags);
    if (!copy) {
      skipped.push({ key, reason: "no_template" });
      continue;
    }
    releases.push({
      key,
      cellId,
      timeBand: band,
      category,
      polarity: CATEGORY_POLARITY[category],
      tags: tags.slice(0, MAX_TAGS_IN_COPY),
      copy,
      contributors: contributions.map((c) => c.actorHash),
      reportIds: contributions.map((c) => c.reportId),
    });
  }
  return { releases, skipped };
}
