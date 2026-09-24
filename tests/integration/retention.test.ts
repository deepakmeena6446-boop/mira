import { describe, expect, it } from "vitest";
import { getSql } from "@/server/db/client";
import { purgeExpired } from "@/server/retention";

describe("retention purge", () => {
  it("hard-deletes expired reports (with structured rows), actor sessions and counters", async () => {
    const sql = getSql();
    await sql`DELETE FROM reports_private`;
    await sql`DELETE FROM actor_sessions`;
    const now = new Date("2026-10-30T00:00:00Z");
    const [old] = await sql`
      INSERT INTO reports_private (actor_hash, idempotency_key, involvement, category, coarse_cell_id, recency_bucket, time_band, status, created_at, expires_at)
      VALUES ('a', 'k1', 'witnessed', 'environment', 'c1-1', 'today', 'late', 'approved', '2026-09-29T00:00:00Z', '2026-10-29T00:00:00Z') RETURNING id`;
    await sql`INSERT INTO report_structured (report_id, category, cell_id, time_band, recency_bucket, approved_at) VALUES (${old.id}, 'environment', 'c1-1', 'late', 'today', now())`;
    await sql`
      INSERT INTO reports_private (actor_hash, idempotency_key, involvement, category, coarse_cell_id, recency_bucket, time_band, created_at, expires_at)
      VALUES ('a', 'k2', 'witnessed', 'environment', 'c1-1', 'today', 'late', '2026-10-20T00:00:00Z', '2026-11-19T00:00:00Z')`;
    await sql`INSERT INTO actor_sessions (token_hash, expires_at) VALUES ('t-old', '2026-10-01T00:00:00Z'), ('t-new', '2026-11-20T00:00:00Z')`;
    const counts = await purgeExpired(sql, now);
    expect(counts.reports).toBe(1);
    expect(counts.actorSessions).toBe(1);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM report_structured`;
    expect(n).toBe(0);
    const [{ r }] = await sql`SELECT count(*)::int AS r FROM reports_private`;
    expect(r).toBe(1);
  });
});
