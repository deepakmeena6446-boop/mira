// Deliberately not "server-only": tests drive these providers with a stubbed fetch.
import type { SafetySourceResult } from "@/domain/safety-updates";

/**
 * Where safety updates are discovered. A provider is an index of what was published, never
 * proof that something happened: every result keeps its publisher and link.
 *
 * Privacy by construction: a search carries place NAMES at city level or coarser. No
 * coordinates, no neighbourhood, no user identity ever reach a provider.
 */
export interface SafetySearch {
  /** City / town ("Delhi"), or the region name when no city is known. */
  place: string;
  countryName: string | null;
  windowDays: number;
}

export interface SafetyIntelligenceProvider {
  /** Stable id ("gdelt"), shown as the source name in evidence states. */
  id: string;
  /** Human name for the UI ("GDELT news index"). */
  label: string;
  search(params: SafetySearch): Promise<SafetySourceResult[]>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: "rate_limited" | "busy" | "bad_response" | "http_error" | "timeout" | "invalid_query",
    readonly retryable: boolean,
    message?: string,
  ) {
    super(message ?? code);
  }
}

// ── GDELT DOC 2.0 ────────────────────────────────────────────────────────────────────────────

/**
 * English search terms. GDELT searches machine translations of 65 languages, so these find
 * non-English coverage too; the relevance gate then reads the original headline.
 */
export const GDELT_TERMS = [
  '"sexual assault"', "rape", "molested", "molestation", "harassment", "stalking", "stalked", '"eve teasing"', "groped",
  "abducted", "abduction", "kidnapped", '"missing woman"', '"missing girl"', '"human trafficking"', "trafficked",
  '"acid attack"', "femicide", "feminicide", '"drink spiking"', '"spiked drink"', '"needle spiking"', '"honour killing"', '"honor killing"',
  '"indecent exposure"',
];

const GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
/** GDELT asks for at most one request every 5 seconds from an address. */
const GDELT_SPACING_MS = 5_500;
/** Don't hold an app request longer than this waiting for our GDELT turn: fail as "busy" instead. */
const GDELT_MAX_QUEUE_MS = 6_000;
const GDELT_TIMEOUT_MS = 12_000;

let gdeltNextAt = 0;

/** "Delhi" → a safe quoted phrase; null if nothing searchable is left (GDELT rejects short phrases). */
export function gdeltPlacePhrase(place: string): string | null {
  const clean = place.normalize("NFKC").replace(/[^\p{L}\p{M}\p{N}' .-]/gu, " ").replace(/\s+/g, " ").trim();
  return clean.length >= 3 ? `"${clean}"` : null;
}

export function gdeltQuery(params: SafetySearch): string | null {
  const phrase = gdeltPlacePhrase(params.place);
  return phrase ? `${phrase} (${GDELT_TERMS.join(" OR ")})` : null;
}

/** "20260926T081500Z" → ISO; null when malformed. */
export function gdeltDate(s: string | undefined): string | null {
  const m = s && /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

export function gdeltProvider(fetchImpl: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): SafetyIntelligenceProvider {
  return {
    id: "gdelt",
    label: "GDELT news index",
    async search(params) {
      const query = gdeltQuery(params);
      if (!query) throw new ProviderError("invalid_query", false, "place name too short to search");
      const wait = gdeltNextAt - Date.now();
      if (wait > GDELT_MAX_QUEUE_MS) throw new ProviderError("busy", true);
      gdeltNextAt = Math.max(Date.now(), gdeltNextAt) + GDELT_SPACING_MS;
      if (wait > 0) await sleep(wait);

      const url = new URL(GDELT_URL);
      url.search = new URLSearchParams({ query, mode: "ArtList", format: "json", maxrecords: "75", sort: "DateDesc", timespan: `${params.windowDays}d` }).toString();
      let res: Response;
      try {
        res = await fetchImpl(url, { headers: { "user-agent": "MIRA/0.1 (women-safety context)" }, signal: AbortSignal.timeout(GDELT_TIMEOUT_MS) });
      } catch (err) {
        throw new ProviderError("timeout", true, err instanceof Error ? err.message : String(err));
      }
      const body = await res.text();
      if (res.status === 429 || /limit requests to one every/i.test(body)) throw new ProviderError("rate_limited", true);
      if (!res.ok) throw new ProviderError("http_error", res.status >= 500, `HTTP ${res.status}`);
      let data: { articles?: GdeltArticle[] };
      try {
        // GDELT answers query errors as plain text with status 200; an empty result is "{}".
        data = body.trim() ? (JSON.parse(body) as { articles?: GdeltArticle[] }) : {};
      } catch {
        throw new ProviderError("bad_response", false, body.slice(0, 120));
      }
      const out: SafetySourceResult[] = [];
      for (const a of data.articles ?? []) {
        const publishedAt = gdeltDate(a.seendate);
        if (!a.url || !a.title || !publishedAt || !/^https?:\/\//.test(a.url)) continue;
        let publisher = a.domain ?? "";
        try {
          publisher ||= new URL(a.url).hostname;
        } catch {
          continue;
        }
        out.push({ url: a.url, title: a.title.trim(), publishedAt, publisher, language: a.language ?? null, sourceCountry: a.sourcecountry ?? null, via: "gdelt" });
      }
      return out;
    },
  };
}

/** Test/dev hook: reset GDELT request spacing. */
export function resetGdeltSpacing(): void {
  gdeltNextAt = 0;
}

// ── Fixture (E2E and local development only; never enabled by the public beta profile) ──────

/** Deterministic sample coverage relative to `now`, labelled "[Sample]" so it can't pass as real news. */
export function fixtureProvider(now: () => Date = () => new Date()): SafetyIntelligenceProvider {
  return {
    id: "fixture",
    label: "Sample data (test mode)",
    async search(params) {
      const t = (hoursAgo: number) => new Date(now().getTime() - hoursAgo * 3600_000).toISOString();
      const p = params.place;
      return [
        { url: `https://news.example.com/${encodeURIComponent(p)}/metro-harassment`, title: `[Sample] Woman harassed on ${p} metro, accused arrested`, publishedAt: t(30), publisher: "news.example.com", language: "English", sourceCountry: params.countryName, via: "fixture" },
        { url: `https://daily.example.org/${encodeURIComponent(p)}/metro-harassment-arrest`, title: `[Sample] ${p} metro: woman harassed, accused arrested by police`, publishedAt: t(28), publisher: "daily.example.org", language: "English", sourceCountry: params.countryName, via: "fixture" },
        { url: `https://police.example.gov/${encodeURIComponent(p)}/spiking-advisory`, title: `[Sample] Police issue drink spiking warning for ${p} bars`, publishedAt: t(50), publisher: "police.example.gov", language: "English", sourceCountry: params.countryName, via: "fixture" },
        { url: `https://sport.example.com/${encodeURIComponent(p)}/final`, title: `[Sample] ${p} women's team wins league final`, publishedAt: t(5), publisher: "sport.example.com", language: "English", sourceCountry: params.countryName, via: "fixture" },
      ];
    },
  };
}
