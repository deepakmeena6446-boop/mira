import "server-only";
import type postgres from "postgres";

export interface AdminRelease {
  id: string;
  releaseWeek: string;
  cellId: string;
  timeBand: string;
  category: string;
  copy: string;
  expiresAt: string;
}

/** Active public releases (what KNOW currently shows). No contributor data. */
export async function listActiveReleases(sql: postgres.Sql, now: Date): Promise<AdminRelease[]> {
  const rows = await sql<{ id: string; release_week: Date; cell_id: string; time_band: string; category: string; copy: string; expires_at: Date }[]>`
    SELECT id, release_week, cell_id, time_band, category, copy, expires_at FROM aggregate_releases
    WHERE suppressed_at IS NULL AND expires_at > ${now} ORDER BY release_week DESC, cell_id, time_band`;
  return rows.map((r) => ({
    id: r.id,
    releaseWeek: new Date(r.release_week).toISOString().slice(0, 10),
    cellId: r.cell_id,
    timeBand: r.time_band,
    category: r.category,
    copy: r.copy,
    expiresAt: new Date(r.expires_at).toISOString(),
  }));
}
