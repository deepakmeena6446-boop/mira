import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { cellFor } from "@/domain/pilot";
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
    placeId: z.guid(),
    recency: z.enum(RECENCIES),
    timeBand: z.enum(REPORT_TIME_BANDS),
    narrative: z.string().max(4000).optional().default(""),
    aiConsent: z.boolean().optional().default(false),
  })
  .strict();
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
  const [place] = await sql<{ lat: number; lon: number }[]>`SELECT ST_Y(point) AS lat, ST_X(point) AS lon FROM places WHERE id = ${input.placeId}`;
  const cell = place ? cellFor(place) : null;
  if (!cell) {
    throw new ApiError(422, "outside_pilot", "Choose a place inside the pilot area (DU North Campus around Vishwavidyalaya Metro).", { fields: ["placeId"] });
  }
  return { input, narrative, cell };
}

export async function submitReport(sql: postgres.Sql, actorHash: string, prepared: PreparedReport, clock: Clock): Promise<SubmitResult> {
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
                                 encrypted_text, text_fingerprint, redaction_flags, hold_reasons, ai_consent, status, created_at, expires_at)
    VALUES (${actorHash}, ${input.idempotencyKey}, ${input.involvement}, ${input.category}, ${cell}, ${input.recency}, ${input.timeBand},
            ${narrative ? encryptText(narrative, "report_text") : null},
            ${narrative ? hmacHex("report-fingerprint", narrative.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()) : null},
            ${sql.json(flags)}, ${holdReasons}, ${input.aiConsent}, ${status}, ${created}, ${expires})
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
