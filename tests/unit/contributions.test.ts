import { describe, expect, it } from "vitest";
import {
  bandForHour,
  chooseCheck,
  evaluateClaim,
  evaluateLighting,
  localWhen,
  opposing,
  placeStatus,
  receiptDecision,
  sampleCells,
  type CheckCandidate,
  type PlaceSignal,
} from "@/domain/contributions";
import { DEFAULT_STEWARD, impactLine, impactSummary, stewardStatus, type ReceiptRow } from "@/domain/reputation";

const NOW = new Date("2026-09-26T12:00:00Z");
const TODAY = "2026-09-26";
const at = { weekday: 4, band: "evening" as const };
const sig = (claim: PlaceSignal["claim"], voter: string, over: Partial<PlaceSignal> = {}): PlaceSignal => ({ claim, voter, day: TODAY, weekday: 4, band: "evening", ...over });

describe("place corroboration (engine doc §6.5)", () => {
  it("one voice is pending; two independent voices corroborate", () => {
    expect(evaluateClaim("open", at, [sig("open", "a")], NOW)).toEqual({ state: "pending" });
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "b")], NOW)).toEqual({ state: "corroborated", by: "corroboration" });
  });

  it("the same voice twice is still one voice", () => {
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "a", { day: "2026-09-20" })], NOW)).toEqual({ state: "pending" });
  });

  it("time-dependent claims compare only the same weekday × band, within 4 weeks", () => {
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "b", { band: "late" })], NOW).state).toBe("pending");
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "b", { weekday: 5 })], NOW).state).toBe("pending");
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "b", { day: "2026-08-20" })], NOW).state).toBe("pending");
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "b", { day: "2026-09-05" })], NOW).state).toBe("corroborated");
  });

  it("one voice + agreeing listed hours is a provider confirmation (open/closed only)", () => {
    expect(evaluateClaim("open", at, [sig("open", "a")], NOW, true)).toEqual({ state: "corroborated", by: "provider" });
    expect(evaluateClaim("open", at, [sig("open", "a")], NOW, false)).toEqual({ state: "pending" });
    expect(evaluateClaim("gone", { weekday: null, band: null }, [sig("gone", "a", { weekday: null, band: null })], NOW, true)).toEqual({ state: "pending" });
  });

  it("disagreement means reports differ and nobody is credited, unless outvoted 3 to 1", () => {
    const differ = evaluateClaim("open", at, [sig("open", "a"), sig("closed", "b")], NOW);
    expect(differ).toEqual({ state: "differ" });
    expect(receiptDecision(differ)).toEqual({ status: "contradicted" });
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "b"), sig("closed", "c")], NOW).state).toBe("differ");
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("open", "b"), sig("open", "c"), sig("closed", "d")], NOW).state).toBe("corroborated");
    expect(evaluateClaim("closed", at, [sig("open", "a"), sig("open", "b"), sig("open", "c"), sig("closed", "d")], NOW).state).toBe("contradicted");
    // A provider can't outvote a person who disagrees.
    expect(evaluateClaim("open", at, [sig("open", "a"), sig("closed", "b")], NOW, true).state).toBe("differ");
  });

  it("someone finding the place open contradicts 'gone' (any day), and corrections need two people", () => {
    expect(opposing("gone")).toEqual(["open", "staffed", "entrance_open"]);
    const none = { weekday: null, band: null };
    expect(evaluateClaim("gone", none, [sig("gone", "a", none)], NOW).state).toBe("pending");
    expect(evaluateClaim("gone", none, [sig("gone", "a", none), sig("gone", "b", none)], NOW).state).toBe("corroborated");
    expect(evaluateClaim("gone", none, [sig("gone", "a", none), sig("open", "b", { weekday: 1, band: "day" })], NOW).state).toBe("differ");
    // entrance closures only count for a week
    expect(evaluateClaim("entrance_closed", none, [sig("entrance_closed", "a", { ...none, day: "2026-09-10" }), sig("entrance_closed", "b", none)], NOW).state).toBe("pending");
  });

  it("place status states only corroborated claims", () => {
    const s = placeStatus([sig("closed", "a"), sig("closed", "b"), sig("hours_wrong", "c", { weekday: null, band: null })], at, NOW);
    expect(s).toMatchObject({ closedAtThisTime: true, openAtThisTime: false, hoursDisputed: false, gone: false, reportsDiffer: false });
  });
});

describe("lighting receipts reuse the walker rule (≥ 3 voices, ≥ 60%)", () => {
  const cell = (lit: number, partly: number, dark: number) => ({ cell: "ttnfv2u8", lit, partly, dark });
  it("verifies, contradicts or waits", () => {
    expect(evaluateLighting("lit", [cell(2, 0, 0)])).toBe("pending"); // two voices: not enough
    expect(evaluateLighting("lit", [cell(3, 0, 0)])).toBe("verified");
    expect(evaluateLighting("lit", [cell(1, 0, 3)])).toBe("contradicted");
    expect(evaluateLighting("dark", [cell(2, 1, 0)])).toBe("contradicted"); // 2 of 3 said lit: the walker verdict is lit
    expect(evaluateLighting("partly", [cell(3, 0, 0), cell(0, 0, 3)])).toBe("verified");
    expect(evaluateLighting("partly", [cell(3, 0, 0)])).toBe("pending");
  });
  it("samples a few cells, never the whole route", () => {
    const cells = Array.from({ length: 50 }, (_, i) => `ttnfv${String(i).padStart(3, "0")}`);
    const s = sampleCells(cells, 8);
    expect(s.length).toBeLessThanOrEqual(8);
    expect(s[0]).toBe(cells[0]);
    expect(s[s.length - 1]).toBe(cells[49]);
  });
});

describe("local time for checks", () => {
  it("uses the journey's zone, else mean solar time (never a hardcoded country zone)", () => {
    const d = new Date("2026-09-28T16:00:00Z"); // Monday
    expect(localWhen(d, "Asia/Kolkata", 77)).toMatchObject({ weekday: 0, hour: 21, minute: 30 });
    expect(localWhen(d, "America/New_York", -74)).toMatchObject({ weekday: 0, hour: 12 });
    expect(localWhen(d, null, 77.2)).toMatchObject({ weekday: 0, hour: 21 }); // +5 h solar
    expect(localWhen(d, "Not/AZone", -0.1)).toMatchObject({ weekday: 0, hour: 16 });
    expect([bandForHour(5), bandForHour(6), bandForHour(18), bandForHour(22)]).toEqual(["late", "day", "evening", "late"]);
  });
});

describe("MIRA Checks: one question, chosen by value", () => {
  const c = (key: string, over: Partial<CheckCandidate> = {}): CheckCandidate => ({ key, name: key, hoursKnown: true, contested: false, alreadyAnswered: false, ...over });
  it("contested first, then unknown hours, then known hours", () => {
    expect(chooseCheck([c("known"), c("unknown", { hoursKnown: false }), c("contested", { contested: true })], false)?.key).toBe("contested");
    expect(chooseCheck([c("known"), c("unknown", { hoursKnown: false })], false)?.key).toBe("unknown");
    expect(chooseCheck([c("known")], false)?.key).toBe("known");
  });
  it("at night a plain confirmation yields to 'Was the way lit?'; answered places are never asked again", () => {
    expect(chooseCheck([c("known")], true)).toBeNull();
    expect(chooseCheck([c("unknown", { hoursKnown: false })], true)?.key).toBe("unknown");
    expect(chooseCheck([c("unknown", { hoursKnown: false, alreadyAnswered: true })], false)).toBeNull();
    expect(chooseCheck([], false)).toBeNull();
  });
});

describe("impact and Local Steward", () => {
  const r = (over: Partial<ReceiptRow> = {}): ReceiptRow => ({ kind: "place_status", status: "verified", counted: true, day: TODAY, areaKey: "a1", ...over });

  it("impact counts only verified receipts that count; pending/differing/expired never", () => {
    const s = impactSummary([r(), r({ counted: false }), r({ status: "pending", counted: false }), r({ status: "contradicted", counted: false }), r({ status: "expired", counted: false }), r({ kind: "lighting" })]);
    expect(s).toMatchObject({ verified: 2, pending: 1, differed: 1, byKind: { place_status: 1, lighting: 1, correction: 0 } });
    expect(impactLine(s)).toBe("You helped verify 2 pieces of local information.");
    expect(impactLine(impactSummary([r({ status: "pending", counted: false })]))).toBeNull();
    expect(impactLine(impactSummary([r()]))).toBe("You helped verify 1 piece of local information.");
  });

  it("flags bursts and high disagreement", () => {
    expect(impactSummary(Array.from({ length: 26 }, () => r())).flags).toContain("burst");
    const mixed = [...Array.from({ length: 2 }, () => r()), ...Array.from({ length: 5 }, () => r({ status: "contradicted", counted: false }))];
    expect(impactSummary(mixed).flags).toContain("high_disagreement");
  });

  const t = { ...DEFAULT_STEWARD, minVerified: 4, minActiveDays: 2, minAreas: 2, minAgreement: 0.8, minAccountDays: 30 };
  const old = { durable: true, createdAt: new Date("2026-06-01T00:00:00Z") };
  const good = [r({ day: "2026-09-01", areaKey: "a" }), r({ day: "2026-09-02", areaKey: "b" }), r({ day: "2026-09-02", areaKey: "b" }), r({ day: "2026-09-03", areaKey: "a" })];

  it("is earned by sustained, corroborated, diverse evidence", () => {
    expect(stewardStatus(impactSummary(good), old, t, NOW)).toEqual({ steward: true, needs: [] });
  });

  it("never from raw counts: each missing condition is named honestly", () => {
    const sameDay = good.map((x) => ({ ...x, day: TODAY }));
    expect(stewardStatus(impactSummary(sameDay), old, t, NOW).needs).toEqual(["Verified contributions on 1 more day"]);
    const oneArea = good.map((x) => ({ ...x, areaKey: "a" }));
    expect(stewardStatus(impactSummary(oneArea), old, t, NOW).needs).toEqual(["Verified contributions in 1 more area"]);
    const volume = [...good, ...Array.from({ length: 20 }, () => r({ status: "pending", counted: false }))];
    expect(stewardStatus(impactSummary(volume), old, t, NOW).steward).toBe(true); // pending volume doesn't help
    const burst = [...good, ...Array.from({ length: 30 }, () => r({ status: "pending", counted: false }))];
    expect(stewardStatus(impactSummary(burst), old, t, NOW).needs).toEqual(["No unusual activity on the account (for example, very many answers in one day)"]);
    const disputed = [...good, r({ status: "contradicted", counted: false }), r({ status: "contradicted", counted: false })];
    expect(stewardStatus(impactSummary(disputed), old, t, NOW).needs).toEqual(["At least 80% of your decided answers confirmed by others"]);
    const demo = stewardStatus(impactSummary(good), { durable: false, createdAt: new Date("2026-09-20T00:00:00Z") }, t, NOW);
    expect(demo.steward).toBe(false);
    expect(demo.needs[0]).toMatch(/email sign-in/);
    expect(demo.needs[1]).toMatch(/at least 30 days old \(24 days to go\)/);
    expect(stewardStatus(impactSummary([]), old, t, NOW).needs).toContain("4 more verified contributions");
  });
});
