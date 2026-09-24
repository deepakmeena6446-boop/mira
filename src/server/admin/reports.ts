import "server-only";
import type postgres from "postgres";
import { decide, type ModerationAction, type ReportStatus, type StructuredFields } from "@/domain/moderation";
import { detectPii, redact } from "@/domain/report/text";
import { decryptText, encryptText } from "@/server/crypto";
import { ApiError, notFound } from "@/server/http/errors";
import type { Clock } from "@/server/clock";
import { onReportWithdrawn } from "@/server/aggregate/withdraw";

export interface AdminReportSummary {
  id: string;
  status: ReportStatus;
  involvement: string;
  category: string;
  cellId: string;
  recency: string;
  timeBand: string;
  hasText: boolean;
  piiFlags: Array<{ type: string; count: number }>;
  holdReasons: string[];
  withdrawn: boolean;
  submittedHour: string;
}

export interface AdminReportDetail extends AdminReportSummary {
  structured: { category: string; tags: string[]; timeBand: string; approvedAt: string } | null;
  duplicateHints: { sameBrowserSimilar: number; sameText: number };
  reviewReason: string | null;
  redacted: boolean;
  text?: string | null;
}

type Row = {
  id: string;
  status: ReportStatus;
  involvement: string;
  category: string;
  coarse_cell_id: string;
  recency_bucket: string;
  time_band: string;
  encrypted_text: string | null;
  redaction_flags: Array<{ type: string; count: number }>;
  hold_reasons: string[];
  created_at: Date;
  withdrawn_at: Date | null;
};

function summary(r: Row): AdminReportSummary {
  return {
    id: r.id,
    status: r.status,
    involvement: r.involvement,
    category: r.category,
    cellId: r.coarse_cell_id,
    recency: r.recency_bucket,
    timeBand: r.time_band,
    hasText: r.encrypted_text !== null,
    piiFlags: r.redaction_flags,
    holdReasons: r.hold_reasons,
    withdrawn: r.withdrawn_at !== null,
    submittedHour: new Date(r.created_at).toISOString(),
  };
}

export async function listReports(sql: postgres.Sql, status: ReportStatus, limit = 100): Promise<AdminReportSummary[]> {
  const rows = await sql<Row[]>`
    SELECT r.id, r.status, r.involvement, r.category, r.coarse_cell_id, r.recency_bucket, r.time_band, r.encrypted_text,
           r.redaction_flags, r.hold_reasons, r.created_at, s.withdrawn_at
    FROM reports_private r LEFT JOIN report_structured s ON s.report_id = r.id
    WHERE r.status = ${status}
    ORDER BY r.created_at ASC, r.id
    LIMIT ${limit}`;
  return rows.map(summary);
}

export async function countByStatus(sql: postgres.Sql): Promise<Record<string, number>> {
  const rows = await sql<{ status: string; n: number }[]>`SELECT status, count(*)::int AS n FROM reports_private GROUP BY status`;
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export async function getReport(sql: postgres.Sql, id: string, opts: { includeText: boolean; adminSessionId: string }): Promise<AdminReportDetail> {
  const [r] = await sql<(Row & { actor_hash: string; text_fingerprint: string | null; review_reason: string | null; redacted_at: Date | null; s_category: string | null; s_tags: string[] | null; s_time_band: string | null; approved_at: Date | null })[]>`
    SELECT r.*, s.withdrawn_at, s.category AS s_category, s.tags AS s_tags, s.time_band AS s_time_band, s.approved_at
    FROM reports_private r LEFT JOIN report_structured s ON s.report_id = r.id WHERE r.id = ${id}`;
  if (!r) throw notFound("Report not found. It may have been deleted under the retention policy.");
  const [hints] = await sql<{ similar: number; same_text: number }[]>`
    SELECT
      (SELECT count(*)::int FROM reports_private o WHERE o.id <> ${r.id} AND o.actor_hash = ${r.actor_hash}
         AND o.coarse_cell_id = ${r.coarse_cell_id} AND o.category = ${r.category} AND o.time_band = ${r.time_band}) AS similar,
      (SELECT count(*)::int FROM reports_private o WHERE o.id <> ${r.id} AND ${r.text_fingerprint}::text IS NOT NULL
         AND o.text_fingerprint = ${r.text_fingerprint}) AS same_text`;
  const detail: AdminReportDetail = {
    ...summary(r),
    structured: r.s_category
      ? { category: r.s_category, tags: r.s_tags ?? [], timeBand: r.s_time_band!, approvedAt: new Date(r.approved_at!).toISOString() }
      : null,
    duplicateHints: { sameBrowserSimilar: hints.similar, sameText: hints.same_text },
    reviewReason: r.review_reason,
    redacted: r.redacted_at !== null,
  };
  if (opts.includeText) {
    detail.text = r.encrypted_text ? decryptText(r.encrypted_text, "report_text") : null;
    await sql`INSERT INTO admin_audit (admin_session_id, action, report_id) VALUES (${opts.adminSessionId}, 'open_text', ${r.id})`;
  }
  return detail;
}

/** Assign a duplicate group: same browser + cell + category + band, or identical text, share one group. */
async function duplicateGroupFor(tx: postgres.TransactionSql, r: { id: string; actor_hash: string; coarse_cell_id: string; category: string; time_band: string; text_fingerprint: string | null }): Promise<string> {
  const [match] = await tx<{ duplicate_group: string }[]>`
    SELECT s.duplicate_group FROM report_structured s JOIN reports_private o ON o.id = s.report_id
    WHERE o.id <> ${r.id} AND s.duplicate_group IS NOT NULL AND (
      (o.actor_hash = ${r.actor_hash} AND o.coarse_cell_id = ${r.coarse_cell_id} AND o.category = ${r.category} AND o.time_band = ${r.time_band})
      OR (${r.text_fingerprint}::text IS NOT NULL AND o.text_fingerprint = ${r.text_fingerprint}))
    ORDER BY s.approved_at ASC LIMIT 1`;
  return match?.duplicate_group ?? r.id;
}

export async function moderate(
  sql: postgres.Sql,
  adminSessionId: string,
  id: string,
  action: ModerationAction,
  opts: { reason?: string; structured?: StructuredFields },
  clock: Clock,
): Promise<{ status: ReportStatus; changed: boolean }> {
  const now = clock.now();
  const result = await sql.begin(async (tx) => {
    const [r] = await tx<(Row & { actor_hash: string; text_fingerprint: string | null; expires_at: Date })[]>`
      SELECT r.*, s.withdrawn_at FROM reports_private r LEFT JOIN report_structured s ON s.report_id = r.id
      WHERE r.id = ${id} FOR UPDATE OF r`;
    if (!r) throw notFound("Report not found.");
    const unresolvedPii = Array.isArray(r.redaction_flags) && r.redaction_flags.length > 0;
    const d = decide({ status: r.status, unresolvedPii, withdrawn: r.withdrawn_at !== null }, action, opts);
    if (!d.ok) throw new ApiError(d.code === "invalid_transition" ? 409 : 422, d.code, d.message);
    if (!d.changed) return { status: d.next, changed: false, withdrew: false };

    let withdrew = false;
    switch (action) {
      case "approve": {
        const s = opts.structured!;
        const group = await duplicateGroupFor(tx, r);
        await tx`UPDATE reports_private SET status = 'approved', category = ${s.category}, time_band = ${s.timeBand}, reviewed_at = ${now}, review_reason = NULL WHERE id = ${id}`;
        await tx`
          INSERT INTO report_structured (report_id, category, tags, cell_id, time_band, recency_bucket, approved_at, duplicate_group)
          VALUES (${id}, ${s.category}, ${s.tags}, ${r.coarse_cell_id}, ${s.timeBand}, ${r.recency_bucket}, ${now}, ${group})`;
        break;
      }
      case "edit": {
        const s = opts.structured!;
        await tx`UPDATE reports_private SET category = ${s.category}, time_band = ${s.timeBand} WHERE id = ${id}`;
        await tx`UPDATE report_structured SET category = ${s.category}, tags = ${s.tags}, time_band = ${s.timeBand} WHERE report_id = ${id}`;
        break;
      }
      case "hold":
        await tx`UPDATE reports_private SET status = 'held', reviewed_at = ${now}, review_reason = ${opts.reason!} WHERE id = ${id}`;
        break;
      case "reject": {
        // Remove the private text now; the row itself is hard-deleted within 24 hours.
        const expires = new Date(Math.min(new Date(r.expires_at).getTime(), now.getTime() + 24 * 3600_000));
        await tx`UPDATE reports_private SET status = 'rejected', reviewed_at = ${now}, review_reason = ${opts.reason!},
                   encrypted_text = NULL, text_fingerprint = NULL, expires_at = ${expires} WHERE id = ${id}`;
        await tx`DELETE FROM report_structured WHERE report_id = ${id}`;
        break;
      }
      case "withdraw":
        await tx`UPDATE report_structured SET withdrawn_at = ${now} WHERE report_id = ${id}`;
        withdrew = true;
        break;
      case "redact": {
        const text = r.encrypted_text ? decryptText(r.encrypted_text, "report_text") : null;
        const cleaned = text ? redact(text, detectPii(text)) : null;
        await tx`UPDATE reports_private SET encrypted_text = ${cleaned ? encryptText(cleaned, "report_text") : null},
                   redaction_flags = '[]'::jsonb, redacted_at = ${now},
                   hold_reasons = array_remove(hold_reasons, 'identifying_content') WHERE id = ${id}`;
        break;
      }
    }
    await tx`INSERT INTO admin_audit (admin_session_id, action, report_id, reason_code, created_at)
             VALUES (${adminSessionId}, ${action}, ${id}, ${opts.reason ?? null}, ${now})`;
    return { status: d.next, changed: true, withdrew };
  });
  if (result.withdrew) await onReportWithdrawn(sql, adminSessionId, id, clock);
  return { status: result.status, changed: result.changed };
}
