import "server-only";
import { z } from "zod";
import { aiConfigured, getEnv } from "@/server/config/env";
import { CATEGORIES, REPORT_TIME_BANDS } from "@/domain/report/taxonomy";
import { detectPii, normaliseNarrative, redact } from "@/domain/report/text";

/**
 * Optional AI sense-making (product spec §8, architecture §5). Suggests a category and
 * time of day from pre-redacted text only. Never a privacy, truth or publication
 * authority: suggestions are shown to the reporter to accept or ignore, and nothing
 * from the model is stored or published.
 */
export interface Suggestion {
  category: (typeof CATEGORIES)[number] | "unknown";
  timeBand: Exclude<(typeof REPORT_TIME_BANDS)[number], "unsure"> | "unknown";
}

export type SuggestResult = { ok: true; suggestion: Suggestion } | { ok: false; reason: "timeout" | "refusal" | "invalid_output" | "provider_error" };

export interface SuggestionProvider {
  suggest(redactedText: string): Promise<SuggestResult>;
}

const SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "time_of_day"],
  properties: {
    category: { type: "string", enum: [...CATEGORIES, "unknown"] },
    time_of_day: { type: "string", enum: ["day", "evening", "late", "unknown"] },
  },
} as const;

const outputSchema = z
  .object({
    category: z.enum([...CATEGORIES, "unknown"]),
    time_of_day: z.enum(["day", "evening", "late", "unknown"]),
  })
  .strict();

const INSTRUCTIONS =
  "You help categorise a short, anonymous observation about a street or transport environment. " +
  "Choose the single closest category, or 'unknown' if unclear. Choose time_of_day only if the text states it " +
  "(day 06:00-18:00, evening 18:00-22:00, late 22:00-06:00), otherwise 'unknown'. " +
  "Do not judge whether the observation is true. Do not infer anything about any person. Text may be Hindi, English or Hinglish.";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function openAiProvider(opts: { apiKey: string; model: string; fetchImpl?: FetchLike; timeoutMs?: number }): SuggestionProvider {
  const doFetch = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  return {
    async suggest(redactedText) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
      let res: Response;
      try {
        res = await doFetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: opts.model,
            store: false,
            instructions: INSTRUCTIONS,
            input: redactedText,
            text: { format: { type: "json_schema", name: "report_suggestion", strict: true, schema: SUGGESTION_SCHEMA } },
          }),
          signal: ctrl.signal,
        });
      } catch {
        return { ok: false, reason: ctrl.signal.aborted ? "timeout" : "provider_error" };
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) return { ok: false, reason: "provider_error" };
      let body: { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
      try {
        body = await res.json();
      } catch {
        return { ok: false, reason: "invalid_output" };
      }
      const content = (body.output ?? []).flatMap((o) => (o.type === "message" ? (o.content ?? []) : []));
      if (content.some((c) => c.type === "refusal")) return { ok: false, reason: "refusal" };
      const text = content.find((c) => c.type === "output_text")?.text;
      if (!text) return { ok: false, reason: "invalid_output" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, reason: "invalid_output" };
      }
      // Validate again server-side; the provider's schema enforcement is not trusted.
      const v = outputSchema.safeParse(parsed);
      if (!v.success) return { ok: false, reason: "invalid_output" };
      return { ok: true, suggestion: { category: v.data.category, timeBand: v.data.time_of_day } };
    },
  };
}

export function getSuggestionProvider(): SuggestionProvider | null {
  if (!aiConfigured()) return null;
  const env = getEnv();
  return openAiProvider({ apiKey: env.OPENAI_API_KEY!, model: env.OPENAI_MODEL! });
}

/**
 * Deterministic minimisation before anything leaves MIRA: normalise, replace detected
 * identifying spans, and cap length. Exact location, contact and identity are never
 * part of the input (the caller passes narrative text only).
 */
export function minimiseForProvider(narrative: string): string {
  const text = normaliseNarrative(narrative).slice(0, 1000);
  return redact(text, detectPii(text));
}
