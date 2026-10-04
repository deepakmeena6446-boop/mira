import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { encodeGeohash } from "@/domain/geohash";
import { CATEGORIES, INVOLVEMENTS, NARRATIVE_MAX, RECENCIES, REPORT_TIME_BANDS } from "@/domain/report/taxonomy";
import { codePointLength, detectPii, normaliseNarrative, piiFlags } from "@/domain/report/text";
import { encryptText, hmacHex } from "@/server/crypto";
import { ApiError } from "@/server/http/errors";
import type { Clock } from "@/server/clock";
import { BURST_DISTINCT_ACTORS, BURST_WINDOW_MS, REPORT_RETENTION_DAYS } from "./limits";

export const reportInputSchema = z
  .object({
    idempotencyKey: z.guid(),
    involvement: z.enum(INVOLVEMENTS),
    category: z.enum(CATEGORIES),
    placeId: z.guid().optional(),
    location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict().optional(),
    recency: z.enum(RECENCIES),
    timeBand: z.enum(REPORT_TIME_BANDS),
    narrative: z.string().max(4000).optional().default(""),
    aiConsent: z.boolean().optional().default(false),
  })
  .strict()
  .refine((v) => Boolean(v.placeId) !== Boolean(v.location), { message: "Provide either a place or a location", path: ["location"] });
export type ReportInput = z.infer<typeof reportInputSchema>;

export interface SubmitResult {
  replay: boolean;
  held: boolean;
  id: string;
}

/**
 * Validate → map to coarse cell → normalise → deterministic PII scan → encrypt →
 * hold if identifying/burst → save privately. Never publishes anything.
 */
export interface PreparedReport {
  input: ReportInput;
  narrative: string;
  cell: string;
}

/** Validation that needs no actor: runs before any cookie is created. */
export async function prepareReport(sql: postgres.Sql, input: ReportInput): Promise<PreparedReport> {
  const narrative = normaliseNarrative(input.narrative ?? "");
  if (codePointLength(narrative) > NARRATIVE_MAX) {
    throw new ApiError(400, "narrative_too_long", `Please keep the description under ${NARRATIVE_MAX} characters.`, { fields: ["narrative"] });
  }
  // Only a coarse worldwide cell (~1.2 km geohash) is kept — never the exact point or place.
  let point: { lat: number; lon: number } | undefined = input.location;
  if (!point && input.placeId) {
    [point] = await sql<{ lat: number; lon: number }[]>`SELECT ST_Y(point) AS lat, ST_X(point) AS lon FROM places WHERE id = ${input.placeId}`;
  }
  if (!point) throw new ApiError(422, "unknown_place", "Choose where it happened.", { fields: ["placeId"] });
  const cell = encodeGeohash(point.lat, point.lon);
  return { input, narrative, cell };
}

export async function submitReport(sql: postgres.Sql, actorHash: string, prepared: PreparedReport, clock: Clock, userId: string | null = null, networkHash: string | null = null): Promise<SubmitResult> {
  const { input, narrative, cell } = prepared;
  const now = clock.now();
  const spans = narrative ? detectPii(narrative) : [];
  const flags = piiFlags(spans);
  const holdReasons: string[] = [];
  if (flags.length > 0) holdReasons.push("identifying_content");

  const [burst] = await sql<{ n: number }[]>`
    SELECT count(DISTINCT actor_hash)::int AS n FROM reports_private
    WHERE coarse_cell_id = ${cell} AND category = ${input.category}
      AND created_at >= ${new Date(now.getTime() - BURST_WINDOW_MS)}`;
  if (burst.n + 1 >= BURST_DISTINCT_ACTORS) holdReasons.push("burst");

  const created = new Date(Math.floor(now.getTime() / 3600_000) * 3600_000); // truncated to the hour
  const expires = new Date(created.getTime() + REPORT_RETENTION_DAYS * 86_400_000);
  const status = holdReasons.length ? "held" : "pending";

  const rows = await sql<{ id: string; status: string }[]>`
    INSERT INTO reports_private (actor_hash, idempotency_key, involvement, category, coarse_cell_id, recency_bucket, time_band,
                                 encrypted_text, text_fingerprint, redaction_flags, hold_reasons, ai_consent, status, created_at, expires_at, user_id, network_hash)
    VALUES (${actorHash}, ${input.idempotencyKey}, ${input.involvement}, ${input.category}, ${cell}, ${input.recency}, ${input.timeBand},
            ${narrative ? encryptText(narrative, "report_text") : null},
            ${narrative ? hmacHex("report-fingerprint", narrative.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()) : null},
            ${sql.json(flags)}, ${holdReasons}, ${input.aiConsent}, ${status}, ${created}, ${expires}, ${userId}, ${networkHash})
    ON CONFLICT (actor_hash, idempotency_key) DO NOTHING
    RETURNING id, status`;
  if (rows.length === 0) {
    const [existing] = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM reports_private WHERE actor_hash = ${actorHash} AND idempotency_key = ${input.idempotencyKey}`;
    if (!existing) throw new ApiError(409, "conflict", "Please try again.");
    return { replay: true, held: existing.status === "held", id: existing.id };
  }
  return { replay: false, held: status === "held", id: rows[0].id };
}
