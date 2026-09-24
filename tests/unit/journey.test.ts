import { describe, expect, it } from "vitest";
import { dueTransition, purgeAt, userTransition, validateExtension, validateNewEta, displayAlertState } from "@/domain/journey";

const now = new Date("2026-09-24T15:00:00Z");
const m = (n: number) => new Date(now.getTime() + n * 60_000);

describe("journey rules", () => {
  it("accepts ETAs from 5 minutes to 4 hours", () => {
    expect(validateNewEta(now, m(5))).toBeNull();
    expect(validateNewEta(now, m(240))).toBeNull();
    expect(validateNewEta(now, m(2))).toMatch(/at least 5 minutes/);
    expect(validateNewEta(now, m(241))).toMatch(/at most 4 hours/);
  });
  it("marks missed at ETA+10 and expired at ETA+30", () => {
    const eta = m(0);
    expect(dueTransition({ state: "active", etaAt: eta }, m(9))).toBeNull();
    expect(dueTransition({ state: "active", etaAt: eta }, m(10))).toBe("miss");
    expect(dueTransition({ state: "missed", etaAt: eta }, m(29))).toBeNull();
    expect(dueTransition({ state: "missed", etaAt: eta }, m(30))).toBe("expire");
    // A delayed worker still records the miss first.
    expect(dueTransition({ state: "active", etaAt: eta }, m(45))).toBe("miss");
    expect(dueTransition({ state: "arrived", etaAt: eta }, m(45))).toBeNull();
  });
  it("allows arrive/end from open states only, idempotently", () => {
    expect(userTransition("active", "arrive")).toEqual({ ok: true, next: "arrived", changed: true });
    expect(userTransition("missed", "end")).toEqual({ ok: true, next: "ended", changed: true });
    expect(userTransition("arrived", "arrive")).toEqual({ ok: true, next: "arrived", changed: false });
    expect(userTransition("expired", "arrive")).toEqual({ ok: false });
    expect(userTransition("ended", "arrive")).toEqual({ ok: false });
  });
  it("allows one extension before the miss, within 4 hours of creation", () => {
    const j = { state: "active" as const, extended: false, etaAt: m(30), createdAt: now };
    expect(validateExtension(j, m(20), m(60))).toBeNull();
    expect(validateExtension({ ...j, extended: true }, m(20), m(60))).toMatch(/only once/);
    expect(validateExtension(j, m(41), m(90))).toMatch(/already missed/);
    expect(validateExtension(j, m(20), m(241))).toMatch(/4 hours/);
    expect(validateExtension(j, m(20), m(25))).toMatch(/later/);
  });
  it("purges within 24 hours of closing and reports stale claims as unconfirmed", () => {
    expect(purgeAt(now).getTime() - now.getTime()).toBeLessThanOrEqual(24 * 3600_000);
    expect(displayAlertState("claimed", now, m(2))).toBe("claimed");
    expect(displayAlertState("claimed", now, m(6))).toBe("unconfirmed");
  });
});
