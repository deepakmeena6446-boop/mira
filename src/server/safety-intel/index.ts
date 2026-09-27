import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type postgres from "postgres";
import { getEnv } from "@/server/config/env";
import { findCountry, countryContext } from "@/server/locale";
import { MIRA_DAILY_TOKEN_DEFAULT, recordTokens, tokenBudgetSpent } from "@/server/providers/companion/budget";
import type { Reverse } from "@/server/providers/geo/types";
import type { SafetyArea, SafetyWindow } from "@/domain/safety-updates";
import { classifyHeadlines, DEFAULT_SAFETY_CLASSIFIER_MODEL } from "./classifier";
import { safetyUpdates, type SafetyCache, type SafetyEvidence } from "./pipeline";
import { fixtureProvider, gdeltProvider, type SafetyIntelligenceProvider } from "./providers";

export type { SafetyEvidence } from "./pipeline";

const log = (event: string, extra: Record<string, unknown> = {}) => console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event, ...extra }));

/** Which discovery providers run: SAFETY_UPDATES = "gdelt" (default) | "off" | "fixture" (tests/dev). */
export function safetyProviders(): SafetyIntelligenceProvider[] {
  const mode = getEnv().SAFETY_UPDATES ?? "gdelt";
  if (mode === "off") return [];
  if (mode === "fixture") return [fixtureProvider()];
  return [gdeltProvider()];
}

/** Postgres-backed cache; keys are hashed so no place name is used as a key. */
export function dbCache(sql: postgres.Sql): SafetyCache {
  const k = (key: string) => {
    const [kind, ...rest] = key.split(":");
    return `${kind}:${createHash("sha256").update(rest.join(":")).digest("hex")}`;
  };
  return {
    async get<T>(key: string) {
      const [row] = await sql<{ payload: T }[]>`SELECT payload FROM safety_intel_cache WHERE cache_key = ${k(key)} AND expires_at > now()`;
      return row?.payload ?? null;
    },
    async set(key, value, ttlMs) {
      const expires = new Date(Date.now() + ttlMs);
      await sql`
        INSERT INTO safety_intel_cache (cache_key, payload, expires_at) VALUES (${k(key)}, ${sql.json(value as postgres.JSONValue)}, ${expires})
        ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at, created_at = now()`;
    },
  };
}

/**
 * The area to search, at city level or coarser — never the neighbourhood or the point:
 * the city (locality), else the state/region. Null when neither is known.
 */
export function areaFromReverse(r: Reverse): SafetyArea | null {
  const iso = r.country ?? null;
  const countryName = iso ? countryContext(iso).countryName : null;
  if (r.locality) return { name: r.locality, precision: "city", countryIso: iso, countryName };
  if (r.regionName) return { name: r.regionName, precision: "region", countryIso: iso, countryName };
  return null;
}

export async function safetyUpdatesFor(sql: postgres.Sql, area: SafetyArea, windowDays: SafetyWindow): Promise<SafetyEvidence> {
  const env = getEnv();
  const apiKey = env.ANTHROPIC_API_KEY;
  const model = env.SAFETY_CLASSIFIER_MODEL ?? DEFAULT_SAFETY_CLASSIFIER_MODEL;
  const max = Number(env.MIRA_DAILY_TOKEN_MAX ?? MIRA_DAILY_TOKEN_DEFAULT);
  const client = apiKey ? new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 }) : null;

  const { evidence, stats, cached } = await safetyUpdates(
    {
      providers: safetyProviders(),
      cache: dbCache(sql),
      classify: client
        ? async (items) => {
            // The classifier shares Mira's daily token ceiling; over it, ambiguous headlines are simply left out.
            if (await tokenBudgetSpent(sql, max, new Date()).catch(() => true)) return new Map();
            const { results, tokens } = await classifyHeadlines(client, model, items);
            if (tokens) await recordTokens(sql, tokens, new Date()).catch(() => undefined);
            return results;
          }
        : null,
      countryOf: (name) => findCountry(name)?.iso2 ?? null,
    },
    area,
    windowDays,
  );
  if (!cached) log("safety_updates.fetch", { state: evidence.state, precision: area.precision, country: area.countryIso, windowDays, ...stats });
  return evidence;
}
