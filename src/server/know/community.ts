import "server-only";
import type postgres from "postgres";
import { communityStatement } from "@/domain/know-copy";
import type { CommunityObservation, CommunitySection } from "@/domain/know-types";
import type { TimeBand } from "@/domain/time-bands";

/**
 * Community evidence for KNOW. Reads ONLY `aggregate_releases` (architecture §4):
 * released, unexpired, unsuppressed, thresholded summaries for the given cells.
 */
export async function communityFor(sql: postgres.Sql, cells: string[], band: TimeBand, now: Date): Promise<CommunitySection> {
  const rows = cells.length
    ? await sql<{ id: string; polarity: CommunityObservation["polarity"]; category: string; copy: string; time_band: TimeBand; release_week: Date | string; expires_at: Date }[]>`
        SELECT id, polarity, category, copy, time_band, release_week, expires_at
        FROM aggregate_releases
        WHERE cell_id = ANY(${cells}) AND suppressed_at IS NULL AND expires_at > ${now}
        ORDER BY release_week DESC, polarity, category`
    : [];
  // A route can intersect several cells with the same summary; show each wording once.
  const seen = new Set<string>();
  const obs: CommunityObservation[] = [];
  for (const r of rows) {
    const key = `${r.time_band}|${r.category}|${r.copy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    obs.push({
      id: r.id,
      polarity: r.polarity,
      category: r.category,
      text: r.copy,
      timeBand: r.time_band,
      releasedWeek: typeof r.release_week === "string" ? r.release_week : new Date(r.release_week).toISOString().slice(0, 10),
      expiresAt: new Date(r.expires_at).toISOString(),
    });
  }
  const matching = obs.filter((o) => o.timeBand === band);
  const otherBands = obs.filter((o) => o.timeBand !== band);
  return {
    coverage: obs.length ? "multiple_independent_recent_observations" : "no_recent_community_data",
    selectedBand: band,
    matching,
    otherBands,
    statement: communityStatement(band, matching.length, otherBands.length),
  };
}
