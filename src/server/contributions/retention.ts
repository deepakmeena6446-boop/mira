import type postgres from "postgres";
import { PENDING_MAX_DAYS } from "@/domain/contributions";

const DAY_MS = 86_400_000;
/** Decided receipts are kept this long (Local Steward needs sustained evidence), then deleted. */
export const RECEIPT_KEEP_DAYS = 365;
/** place_signals older than every claim window (max 30 days) plus a margin are deleted. */
export const PLACE_SIGNAL_KEEP_DAYS = 45;

/**
 * Contributions retention (hard guarantees, independent of the decision job):
 *  - checks: gone ≤ 24 h after creation (answered or not);
 *  - pending receipts past their maximum wait: expired, and their encrypted link deleted;
 *  - subject_hash cleared 30 days after a decision; expired receipts deleted after 30 days;
 *    decided receipts deleted after a year;
 *  - place_signals deleted after 45 days.
 */
export async function purgeContributions(sql: postgres.Sql, now: Date): Promise<Record<string, number>> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const checks = await sql`DELETE FROM mira_checks WHERE expires_at <= ${now}`;
  const expired = await sql`
    UPDATE contribution_receipts SET status = 'expired', decided_at = ${now}, subject_enc = NULL, verified_by = NULL, counted = false
    WHERE status = 'pending' AND (
      (kind = 'lighting' AND created_at < ${ago(PENDING_MAX_DAYS.lighting)}) OR
      (kind = 'place_status' AND created_at < ${ago(PENDING_MAX_DAYS.place_status)}) OR
      (kind = 'correction' AND created_at < ${ago(PENDING_MAX_DAYS.correction)}))`;
  // A decided place receipt's encrypted answer is retained only through the maximum claim window.
  await sql`UPDATE contribution_receipts SET decision_enc = NULL, claim_key = NULL
    WHERE decision_enc IS NOT NULL AND created_at < ${ago(31)}`;
  await sql`UPDATE contribution_receipts SET subject_hash = NULL WHERE subject_hash IS NOT NULL AND decided_at < ${ago(30)}`;
  const receipts = await sql`
    DELETE FROM contribution_receipts WHERE (status = 'expired' AND decided_at < ${ago(30)}) OR decided_at < ${ago(RECEIPT_KEEP_DAYS)}`;
  const signals = await sql`DELETE FROM place_signals WHERE day < ${ago(PLACE_SIGNAL_KEEP_DAYS)}`;
  return { miraChecks: checks.count, receiptsExpired: expired.count, receipts: receipts.count, placeSignals: signals.count };
}
