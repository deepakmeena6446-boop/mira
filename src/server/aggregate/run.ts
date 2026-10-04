import type postgres from "postgres";
import { computeReleases, MIN_CONTRIBUTORS, RELEASE_TTL_DAYS, releaseKey, type EligibleReport } from "@/domain/aggregation";
import { ELIGIBLE_SUBMISSION_DAYS } from "@/domain/aggregation";
import { isIstMonday, istWeekMonday } from "@/domain/time-bands";
import type { Category } from "@/domain/report/taxonomy";
import type { Clock } from "@/server/clock";
import { getEnv } from "@/server/config/env";

export interface RunSummary {
  ran: boolean;
  releaseWeek: string;
  keysEvaluated: number;
  releasesCreated: number;
  heldForBurst: number;
  /** True when public releases are switched off (PUBLIC_AGGREGATE_RELEASES), so nothing was computed or published. */
  disabled?: boolean;
}

/**
 * Public community notes are OFF unless PUBLIC_AGGREGATE_RELEASES=on. Until moderation operations
 * exist (someone actually on review duty), reports stay private and the weekly job publishes nothing.
 * Fail safe: unset, "off" or anything unreadable means off.
 */
export function publicReleasesEnabled(): boolean {
  try {
    return getEnv().PUBLIC_AGGREGATE_RELEASES === "on";
  } catch {
    return false;
  }
}

/**
 * Weekly release (Mondays, IST). Idempotent per week and serialised with an advisory
 * lock, so several workers or a manual run can't double-release. Does nothing at all unless
 * public releases are switched on (publicReleasesEnabled).
 */
export async function runWeeklyAggregation(sql: postgres.Sql, clock: Clock): Promise<RunSummary> {
  const now = clock.now();
  const week = istWeekMonday(now);
  if (!publicReleasesEnabled()) return { ran: false, releaseWeek: week, keysEvaluated: 0, releasesCreated: 0, heldForBurst: 0, disabled: true };
  if (!isIstMonday(now)) return { ran: false, releaseWeek: week, keysEvaluated: 0, releasesCreated: 0, heldForBurst: 0 };
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('mira-weekly-aggregation'))`;
    const [done] = await tx`SELECT 1 FROM aggregate_runs WHERE release_week = ${week}`;
    if (done) return { ran: false, releaseWeek: week, keysEvaluated: 0, releasesCreated: 0, heldForBurst: 0 };

    const rows = await tx<{ report_id: string; actor_hash: string; network_hash: string | null; duplicate_group: string | null; cell_id: string; time_band: string; category: Category; recency_bucket: string; tags: string[]; created_at: Date }[]>`
      SELECT s.report_id, r.actor_hash, r.network_hash, s.duplicate_group, s.cell_id, s.time_band, s.category, s.recency_bucket, s.tags, r.created_at
      FROM report_structured s JOIN reports_private r ON r.id = s.report_id
      WHERE r.status = 'approved' AND s.withdrawn_at IS NULL
        AND r.created_at > ${new Date(now.getTime() - ELIGIBLE_SUBMISSION_DAYS * 86_400_000)} AND r.created_at <= ${now}`;
    const reports: EligibleReport[] = rows.map((r) => ({
      reportId: r.report_id,
      actorHash: r.actor_hash,
      networkHash: r.network_hash,
      duplicateGroup: r.duplicate_group,
      cellId: r.cell_id,
      timeBand: r.time_band,
      category: r.category,
      recency: r.recency_bucket,
      tags: r.tags,
      submittedAt: new Date(r.created_at),
    }));

    // Most recent release per key (active or expired) and its contributor set.
    const prevRows = await tx<{ cell_id: string; time_band: string; category: string; actor_hash: string }[]>`
      SELECT DISTINCT ON (ar.cell_id, ar.time_band, ar.category, c.actor_hash) ar.cell_id, ar.time_band, ar.category, c.actor_hash
      FROM aggregate_releases ar JOIN aggregate_contributions c ON c.release_id = ar.id
      WHERE ar.id IN (
        SELECT DISTINCT ON (cell_id, time_band, category) id FROM aggregate_releases
        ORDER BY cell_id, time_band, category, released_at DESC)`;
    const previous = new Map<string, Set<string>>();
    for (const p of prevRows) {
      const k = releaseKey(p.cell_id, p.time_band, p.category);
      const set = previous.get(k) ?? new Set<string>();
      set.add(p.actor_hash);
      previous.set(k, set);
    }

    const { releases, skipped } = computeReleases(reports, now, previous);
    const expires = new Date(now.getTime() + RELEASE_TTL_DAYS * 86_400_000);
    for (const rel of releases) {
      // A changed release supersedes the key's active one (never both at once).
      await tx`UPDATE aggregate_releases SET expires_at = ${now}
               WHERE cell_id = ${rel.cellId} AND time_band = ${rel.timeBand} AND category = ${rel.category} AND expires_at > ${now}`;
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO aggregate_releases (release_week, released_at, cell_id, time_band, category, polarity, tags, copy, coverage, observation_window, expires_at)
        VALUES (${week}, ${now}, ${rel.cellId}, ${rel.timeBand}, ${rel.category}, ${rel.polarity}, ${rel.tags}, ${rel.copy},
                'multiple_independent_recent_observations', 'past_4_weeks', ${expires})
        RETURNING id`;
      for (let i = 0; i < rel.contributors.length; i++) {
        await tx`INSERT INTO aggregate_contributions (release_id, actor_hash, report_id) VALUES (${row.id}, ${rel.contributors[i]}, ${rel.reportIds[i]})`;
      }
    }
    const keysEvaluated = releases.length + skipped.length;
    const heldForBurst = skipped.filter((s) => s.reason === "burst_hold").length;
    await tx`INSERT INTO aggregate_runs (release_week, ran_at, keys_evaluated, releases_created, held_for_burst)
             VALUES (${week}, ${now}, ${keysEvaluated}, ${releases.length}, ${heldForBurst})`;
    return { ran: true, releaseWeek: week, keysEvaluated, releasesCreated: releases.length, heldForBurst };
  });
}

/**
 * Re-check active releases that include a withdrawn report; suppress any that no longer
 * have enough independent, still-approved contributors.
 */
export async function recheckReleasesForReport(sql: postgres.Sql, reportId: string, now: Date): Promise<string[]> {
  const suppressed: string[] = [];
  const releases = await sql<{ id: string }[]>`
    SELECT DISTINCT ar.id FROM aggregate_releases ar JOIN aggregate_contributions c ON c.release_id = ar.id
    WHERE c.report_id = ${reportId} AND ar.suppressed_at IS NULL AND ar.expires_at > ${now}`;
  for (const { id } of releases) {
    // Reports removed by the 30-day retention (report_id NULL) still count: they were
    // valid when released. Only withdrawn contributions stop counting.
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(DISTINCT c.actor_hash)::int AS n FROM aggregate_contributions c
      LEFT JOIN report_structured s ON s.report_id = c.report_id
      WHERE c.release_id = ${id} AND (c.report_id IS NULL OR s.withdrawn_at IS NULL)`;
    if (n < MIN_CONTRIBUTORS) {
      await sql`UPDATE aggregate_releases SET suppressed_at = ${now}, suppress_reason = 'contributor_withdrawn' WHERE id = ${id} AND suppressed_at IS NULL`;
      suppressed.push(id);
    }
  }
  return suppressed;
}

/** Emergency removal of a public release (e.g. privacy risk). Takes effect immediately. */
export async function suppressRelease(sql: postgres.Sql, releaseId: string, reason: string, adminSessionId: string, now: Date): Promise<boolean> {
  const res = await sql`UPDATE aggregate_releases SET suppressed_at = ${now}, suppress_reason = ${reason} WHERE id = ${releaseId} AND suppressed_at IS NULL`;
  if (res.count > 0) {
    await sql`INSERT INTO admin_audit (admin_session_id, action, release_id, reason_code, created_at) VALUES (${adminSessionId}, 'suppress_release', ${releaseId}, ${reason}, ${now})`;
  }
  return res.count > 0;
}

/** Drop long-expired releases (and their private contributor links). */
export async function purgeOldReleases(sql: postgres.Sql, now: Date): Promise<number> {
  const res = await sql`DELETE FROM aggregate_releases WHERE expires_at < ${new Date(now.getTime() - RELEASE_TTL_DAYS * 86_400_000)}`;
  return res.count;
}
