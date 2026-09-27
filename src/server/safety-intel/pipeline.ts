// Deliberately not "server-only": the pipeline is pure over injected providers, cache and
// classifier, so tests run it without a network or a database.
import { evidenceState, type EvidenceState, type SourceState } from "@/domain/evidence-state";
import {
  RELEVANCE_SOURCE,
  canonicalUrl,
  clusterCandidates,
  isHttpUrl,
  screenHeadline,
  toUpdate,
  withinWindow,
  type Candidate,
  type SafetyArea,
  type SafetySourceResult,
  type SafetyUpdatesData,
  type SafetyWindow,
} from "@/domain/safety-updates";
import { ClassifierUnavailable, MAX_CLASSIFY, type ClassifyInput, type ClassifyOutput } from "./classifier";
import { ProviderError, type SafetyIntelligenceProvider } from "./providers";

/**
 * Discovery → location + recency → strict relevance gate → classifier for the ambiguous few →
 * dedupe / story clustering → structured updates, with the evidence state of every source.
 * Cached per area + window, so a Home re-render never reaches a provider or a model.
 */
export interface SafetyCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
}

export interface PipelineDeps {
  providers: SafetyIntelligenceProvider[];
  cache: SafetyCache;
  /**
   * Relevance for ambiguous headlines, or null when no classifier is configured. Throws
   * ClassifierUnavailable when it won't run now (budget spent). Either way, and for any headline
   * it leaves out of its answer, the headline is "unassessed" and the result is partial.
   */
  classify: ((items: ClassifyInput[]) => Promise<Map<string, ClassifyOutput>>) | null;
  /** Registry lookup for a provider's country name ("United Kingdom" → "GB"). */
  countryOf: (name: string) => string | null;
  now?: () => Date;
}

export const RESULT_TTL_MS = 30 * 60_000;
/**
 * A failed, unavailable or partial check is remembered briefly, so a flaky provider isn't
 * hammered on every visit and a partial answer isn't served for the full 30 minutes.
 */
export const FAILED_TTL_MS = 5 * 60_000;
export const CLASSIFICATION_TTL_MS = 14 * 86_400_000;
const MAX_UPDATES = 20;

export type SafetyEvidence = EvidenceState<SafetyUpdatesData>;

export interface PipelineStats {
  retrieved: number;
  inWindow: number;
  included: number;
  ambiguous: number;
  classified: number;
  /** Ambiguous headlines nobody judged (no classifier, budget spent, over the per-fetch cap, or failed). */
  unassessed: number;
  excluded: number;
  clusters: number;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export function areaKey(area: SafetyArea, windowDays: SafetyWindow): string {
  return `v1|${area.countryIso ?? "-"}|${fold(area.name)}|${area.precision}|${windowDays}`;
}

/** A city name can exist in several countries: keep a result only if it's plausibly about this one. */
function plausiblyHere(r: SafetySourceResult, area: SafetyArea, countryOf: PipelineDeps["countryOf"]): boolean {
  if (!area.countryIso || !r.sourceCountry) return true;
  if (fold(r.title).includes(fold(area.name))) return true;
  return countryOf(r.sourceCountry) === area.countryIso;
}

const inflight = new Map<string, Promise<{ evidence: SafetyEvidence; stats: PipelineStats | null }>>();

export async function safetyUpdates(deps: PipelineDeps, area: SafetyArea, windowDays: SafetyWindow): Promise<{ evidence: SafetyEvidence; stats: PipelineStats | null; cached: boolean }> {
  const key = `area:${areaKey(area, windowDays)}`;
  const hit = await deps.cache.get<SafetyEvidence>(key).catch(() => null);
  if (hit) return { evidence: hit, stats: null, cached: true };
  // Concurrent requests for the same area share one provider round-trip.
  let run = inflight.get(key);
  if (!run) {
    run = (async () => {
      const result = await runPipeline(deps, area, windowDays);
      const settled = result.evidence.state === "ready" || result.evidence.state === "empty";
      await deps.cache.set(key, result.evidence, settled ? RESULT_TTL_MS : FAILED_TTL_MS).catch(() => undefined);
      return result;
    })().finally(() => inflight.delete(key));
    inflight.set(key, run);
  }
  return { ...(await run), cached: false };
}

export async function runPipeline(deps: PipelineDeps, area: SafetyArea, windowDays: SafetyWindow): Promise<{ evidence: SafetyEvidence; stats: PipelineStats }> {
  const now = (deps.now ?? (() => new Date()))();
  const sources: SourceState[] = [];
  const raw: SafetySourceResult[] = [];

  for (const p of deps.providers) {
    try {
      raw.push(...(await p.search({ place: area.name, countryName: area.countryName, windowDays })));
      sources.push({ source: p.id, state: "ready" });
    } catch (err) {
      const retryable = err instanceof ProviderError ? err.retryable : true;
      sources.push({ source: p.id, state: "failed", retryable });
    }
  }

  // Location + recency, then one row per article URL. A result without an http(s) link is never shown.
  const seen = new Set<string>();
  const fresh = raw.filter((r) => {
    const k = canonicalUrl(r.url);
    if (!isHttpUrl(r.url) || seen.has(k) || !withinWindow(r.publishedAt, windowDays, now) || !plausiblyHere(r, area, deps.countryOf)) return false;
    seen.add(k);
    return true;
  });

  const candidates: Candidate[] = [];
  const ambiguous: Array<{ r: SafetySourceResult; id: string }> = [];
  let excluded = 0;
  for (const r of fresh) {
    const d = screenHeadline(r, now);
    if (d.decision === "include") candidates.push({ ...r, category: d.category });
    else if (d.decision === "ambiguous") ambiguous.push({ r, id: canonicalUrl(r.url) });
    else excluded++;
  }

  // The classifier sees only what the cheap gate couldn't decide, and each article once (cached).
  // Anything it doesn't judge is "unassessed": left out, never guessed in, and never silently
  // turned into "no updates" — the result is partial and says some reports weren't checked.
  let classified = 0;
  let unassessed = 0;
  let relevance: SourceState | null = null;
  if (ambiguous.length) {
    const pending: typeof ambiguous = [];
    for (const a of ambiguous) {
      const c = await deps.cache.get<ClassifyOutput>(`cls:${a.id}`).catch(() => null);
      if (c) {
        classified++;
        if (c.relevant && c.category) candidates.push({ ...a.r, category: c.category, translatedTitle: c.translatedTitle });
      } else pending.push(a);
    }
    if (pending.length && !deps.classify) {
      unassessed = pending.length;
      relevance = { source: RELEVANCE_SOURCE, state: "unavailable", retryable: false };
    } else if (pending.length && deps.classify) {
      const batch = pending.slice(0, MAX_CLASSIFY);
      // Over the per-fetch cap: judged on a later fetch (partial results are cached briefly).
      unassessed = pending.length - batch.length;
      try {
        const out = await deps.classify(batch.map((a) => ({ id: a.id, title: a.r.title, language: a.r.language, publisher: a.r.publisher })));
        let missing = 0;
        for (const a of batch) {
          const c = out.get(a.id);
          if (!c) {
            missing++; // refused, truncated or unparseable: not assessed
            continue;
          }
          classified++;
          await deps.cache.set(`cls:${a.id}`, c, CLASSIFICATION_TTL_MS).catch(() => undefined);
          if (c.relevant && c.category) candidates.push({ ...a.r, category: c.category, translatedTitle: c.translatedTitle });
        }
        unassessed += missing;
        if (missing) relevance = { source: RELEVANCE_SOURCE, state: "failed", retryable: true };
        else if (unassessed) relevance = { source: RELEVANCE_SOURCE, state: "unavailable", retryable: true };
      } catch (err) {
        unassessed += batch.length;
        relevance = err instanceof ClassifierUnavailable ? { source: RELEVANCE_SOURCE, state: "unavailable", retryable: true } : { source: RELEVANCE_SOURCE, state: "failed", retryable: true };
      }
    }
  }
  if (relevance) sources.push(relevance);

  const clusters = clusterCandidates(candidates, area.name);
  const retrievedAt = now.toISOString();
  const updates = clusters
    .map((c) => toUpdate(c, area, retrievedAt))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_UPDATES);
  const data: SafetyUpdatesData = {
    area,
    windowDays,
    updates,
    counts: { official: updates.filter((u) => u.sourceType === "official").length, news: updates.filter((u) => u.sourceType === "news").length },
    community: "unavailable_in_beta",
    checkedAt: retrievedAt,
  };
  const stats: PipelineStats = { retrieved: raw.length, inWindow: fresh.length, included: candidates.length, ambiguous: ambiguous.length, classified, unassessed, excluded, clusters: clusters.length };
  return { evidence: evidenceState(data, updates.length > 0, sources.length ? sources : [{ source: "none", state: "unavailable" }]), stats };
}

/** Test hook. */
export function clearInflight(): void {
  inflight.clear();
}
