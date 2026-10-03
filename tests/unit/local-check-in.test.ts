import { describe, expect, it } from "vitest";
import { createLocalCheckIn, localLoopEligibility, parseLocalCheckIn } from "@/domain/local-check-in";
import { movementIntentSchema } from "@/domain/plan-contract";

describe("guest private loop check-in", () => {
  const now = Date.parse("2026-10-02T23:15:00Z");
  const plan = movementIntentSchema.parse({ version: 1, activity: "Early run", origin: { kind: "named", query: "North Gate", resolution: { source: "search", point: { lat: 28.69, lon: 77.21 } } }, destination: null, loop: true, departure: { local: "2026-10-03T04:45", timeZone: "Asia/Kolkata" }, mode: "walk", constraints: [] });

  it("starts only a near-now, resolved loop without requiring a GPS fix", () => {
    expect(localLoopEligibility(plan, now)).toEqual({ ok: true });
    expect(localLoopEligibility(plan, now + 60 * 60_000)).toMatchObject({ ok: false });
    expect(localLoopEligibility({ ...plan, origin: { kind: "named", query: "North Gate" } }, now)).toMatchObject({ ok: false });
  });

  it("keeps only a bounded timer and expires soon after due time", () => {
    const timer = createLocalCheckIn(30, now)!;
    expect(timer).toEqual({ version: 1, startedAt: now, dueAt: now + 30 * 60_000 });
    expect(JSON.stringify(timer)).not.toMatch(/North Gate|28\.69|77\.21/);
    expect(parseLocalCheckIn(JSON.stringify(timer), timer.dueAt + 29 * 60_000)).toEqual(timer);
    expect(parseLocalCheckIn(JSON.stringify(timer), timer.dueAt + 31 * 60_000)).toBeNull();
    expect(parseLocalCheckIn(JSON.stringify({ ...timer, dueAt: now + 5 * 60 * 60_000 }), now)).toBeNull();
    expect(createLocalCheckIn(236, now)).toBeNull();
  });
});
