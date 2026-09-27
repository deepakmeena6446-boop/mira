// Deliberately not "server-only": the pipeline is pure over injected providers, cache and
// classifier, so tests run it without a network or a database.
import { evidenceState, type EvidenceState, type SourceState } from "@/domain/evidence-state";
import {
  canonicalUrl,
  clusterCandidates,
  screenHeadline,
  toUpdate,
  withinWindow,
  type Candidate,
  type SafetyArea,
  type SafetySourceResult,
  type SafetyUpdatesData,
  type SafetyWindow,
} from "@/domain/safety-updates";
import { MAX_CLASSIFY, type ClassifyInput, type ClassifyOutput } from "./classifier";
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
  /** Relevance for ambiguous headlines, or null when no classifier is configured / budget is spent. */
  classify: ((items: ClassifyInput[]) => Promise<Map<string, ClassifyOutput>>) | null;
  /** Registry lookup for a provider's country name ("United Kingdom" → "GB"). */
  countryOf: (name: string) => string | null;
  now?: () => Date;
}

export const RESULT_TTL_MS = 30 * 60_000;
/** A failed check is remembered briefly so a flaky provider isn't hammered on every visit. */
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
      await deps.cache.set(key, result.evidence, result.evidence.state === "failed" || result.evidence.state === "unavailable" ? FAILED_TTL_MS : RESULT_TTL_MS).catch(() => undefined);
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

  // Location + recency, then one row per article URL.
  const seen = new Set<string>();
  const fresh = raw.filter((r) => {
    const k = canonicalUrl(r.url);
    if (seen.has(k) || !withinWindow(r.publishedAt, windowDays, now) || !plausiblyHere(r, area, deps.countryOf)) return false;
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
  let classified = 0;
  if (ambiguous.length) {
    const pending: typeof ambiguous = [];
    for (const a of ambiguous) {
      const c = await deps.cache.get<ClassifyOutput>(`cls:${a.id}`).catch(() => null);
      if (c) {
        classified++;
        if (c.relevant && c.category) candidates.push({ ...a.r, category: c.category, translatedTitle: c.translatedTitle });
      } else pending.push(a);
    }
    if (pending.length && deps.classify) {
      try {
        const batch = pending.slice(0, MAX_CLASSIFY);
        const out = await deps.classify(batch.map((a) => ({ id: a.id, title: a.r.title, language: a.r.language, publisher: a.r.publisher })));
        for (const a of batch) {
          const c = out.get(a.id);
          if (!c) continue; // not assessed: left out, never guessed in
          classified++;
          await deps.cache.set(`cls:${a.id}`, c, CLASSIFICATION_TTL_MS).catch(() => undefined);
          if (c.relevant && c.category) candidates.push({ ...a.r, category: c.category, translatedTitle: c.translatedTitle });
        }
      } catch {
        sources.push({ source: "relevance-check", state: "failed", retryable: true });
      }
    }
  }

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
  const stats: PipelineStats = { retrieved: raw.length, inWindow: fresh.length, included: candidates.length, ambiguous: ambiguous.length, classified, excluded, clusters: clusters.length };
  return { evidence: evidenceState(data, updates.length > 0, sources.length ? sources : [{ source: "none", state: "unavailable" }]), stats };
}

/** Test hook. */
export function clearInflight(): void {
  inflight.clear();
}
