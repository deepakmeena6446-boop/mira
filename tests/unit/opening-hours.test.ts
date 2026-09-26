import { describe, expect, it } from "vitest";
import { clockLabel, openState, parseOpeningHours, scheduleFromGoogle } from "@/domain/opening-hours";

const at = (day: number, hhmm: string) => ({ day, minute: +hhmm.slice(0, 2) * 60 + +hhmm.slice(3) }); // day 0 = Monday

describe("opening hours (listed hours, parsed strictly)", () => {
  it("parses common OpenStreetMap forms", () => {
    expect(parseOpeningHours("24/7")).toBe("24/7");
    const s = parseOpeningHours("Mo-Sa 09:00-21:00; Su 10:00-14:00")!;
    expect(openState(s, at(0, "10:00"))).toEqual({ state: "open", closesAt: 21 * 60 });
    expect(openState(s, at(6, "15:00"))).toEqual({ state: "closed" });
    expect(openState(s, at(6, "11:00"))).toMatchObject({ state: "open", closesAt: 14 * 60 });
  });

  it("handles split hours, overnight hours and 'off'", () => {
    const split = parseOpeningHours("Mo-Fr 09:00-13:00,14:00-18:00; Sa,Su off")!;
    expect(openState(split, at(1, "13:30")).state).toBe("closed");
    expect(openState(split, at(5, "10:00")).state).toBe("closed");
    const late = parseOpeningHours("18:00-02:00")!;
    expect(openState(late, at(2, "23:30"))).toMatchObject({ state: "open", closesAt: 26 * 60 });
    expect(openState(late, at(3, "01:00"))).toMatchObject({ state: "open", closesAt: 2 * 60 }); // yesterday's evening, past midnight
    expect(openState(late, at(3, "03:00")).state).toBe("closed");
  });

  it("says 'closing' when it would close before she gets there", () => {
    const s = parseOpeningHours("Mo-Su 08:00-22:00")!;
    expect(openState(s, at(4, "21:50"), 5).state).toBe("open");
    expect(openState(s, at(4, "21:50"), 15)).toEqual({ state: "closing", closesAt: 22 * 60 });
  });

  it("treats every-day 00:00-24:00 as open 24h", () => {
    expect(openState(parseOpeningHours("Mo-Su 00:00-24:00"), at(3, "03:00"))).toEqual({ state: "open", closesAt: null });
  });

  it("never guesses: anything it doesn't fully understand is unknown", () => {
    for (const raw of ["sunrise-sunset", "Mo-Fr 09:00-18:00 \"by appointment\"", "Jan-Mar Mo 10:00-12:00", "we 3pm", "", null, "Mo-Fr 25:00-26:00"]) {
      expect(parseOpeningHours(raw), String(raw)).toBeNull();
      expect(openState(parseOpeningHours(raw), at(0, "12:00")).state).toBe("unknown");
    }
    expect(parseOpeningHours("Mo-Sa 09:00-21:00; PH off")).not.toBeNull(); // public-holiday rules are ignored (hours are "listed")
  });

  it("reads Google periods (day 0 = Sunday), including a single open-ended period as 24h", () => {
    expect(scheduleFromGoogle([{ open: { day: 0, hour: 0, minute: 0 } }])).toBe("24/7");
    const s = scheduleFromGoogle([{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } }])!;
    expect(openState(s, at(0, "10:00"))).toMatchObject({ state: "open", closesAt: 17 * 60 + 30 });
    expect(clockLabel(26 * 60)).toBe("02:00");
  });
});
