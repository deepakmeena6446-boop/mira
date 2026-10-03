import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { getSql } from "@/server/db/client";
import { outcomeForTripClose, purgeDecisionOutcomes, recordDecisionOutcome, type DecisionOutcome } from "@/server/decision-outcomes";

describe("coarse decision outcomes", () => {
  it("stores only a UTC day, fixed event and count; expires after 30 days", async () => {
    const sql = getSql();
    const fields = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'decision_outcomes' ORDER BY column_name`;
    expect(fields.map((field) => field.column_name)).toEqual(["count", "day", "event"]);
    const rollback = new Error("rollback-fixture");
    await expect(sql.begin(async (tx) => {
      const fixtureSql = tx as unknown as postgres.Sql;
      const day = new Date("2099-01-01T23:45:00Z");
      await recordDecisionOutcome(fixtureSql, "plan_option_ready", day);
      await recordDecisionOutcome(fixtureSql, "plan_option_ready", day);
      const [row] = await tx<{ count: number }[]>`SELECT count FROM decision_outcomes WHERE day = '2099-01-01' AND event = 'plan_option_ready'`;
      expect(row.count).toBe(2);
      await recordDecisionOutcome(fixtureSql, outcomeForTripClose("arrive"), day);
      await recordDecisionOutcome(fixtureSql, outcomeForTripClose("end"), day);
      const closed = await tx<{ event: string; count: number }[]>`SELECT event, count FROM decision_outcomes WHERE day = '2099-01-01' AND event LIKE 'journey_%' ORDER BY event`;
      expect(closed).toEqual([{ event: "journey_arrived", count: 1 }, { event: "journey_ended", count: 1 }]);
      expect(await purgeDecisionOutcomes(fixtureSql, new Date("2099-02-01T00:00:00Z"))).toBeGreaterThanOrEqual(1);
      throw rollback;
    })).rejects.toBe(rollback);
    await expect(sql.begin((tx) => recordDecisionOutcome(tx as unknown as postgres.Sql, "unexpected_event" as DecisionOutcome, new Date("2099-01-01T00:00:00Z")))).rejects.toMatchObject({ code: "23514" });
    await expect(sql.begin((tx) => recordDecisionOutcome(tx as unknown as postgres.Sql, "journey_completed" as DecisionOutcome, new Date("2099-01-01T00:00:00Z")))).rejects.toMatchObject({ code: "23514" });
  });
});
