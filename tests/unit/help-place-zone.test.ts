import { describe, expect, it } from "vitest";
import { hoursState, rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { localTimeInZone, parseOpeningHours } from "@/domain/opening-hours";
const pharmacy: HelpPoint = { id: "fictional-pharmacy", name: "Fictional Pharmacy", cls: "pharmacy", lat: 51.47, lon: -0.45, hours: "00:00-03:00", schedule: parseOpeningHours("00:00-03:00"), open24h: false, source: "osm" };
describe("support place hours use the checked place zone", () => {
  it("does not recommend a closed London pharmacy because a traveler's device is on India time", () => {
    const at = Date.parse("2026-10-03T20:00Z");
    expect(localTimeInZone(new Date(at), "Asia/Kolkata")).toEqual({ day: 6, minute: 90 });
    expect(localTimeInZone(new Date(at), "Europe/London")).toEqual({ day: 5, minute: 1260 });
    expect(rankHelpPoints([pharmacy], pharmacy, { situation: "unsafe", night: true, at, timeZone: "Europe/London" })).toEqual([]);
  });
  it("keeps listed hours unknown when the point's time zone is unavailable or invalid", () => {
    const at = Date.parse("2026-10-03T20:00Z");
    for (const timeZone of [null, "Invalid/Zone"]) {
      const result = rankHelpPoints([pharmacy], pharmacy, { situation: "unsafe", night: true, at, timeZone, now: { day: 6, minute: 90 } });
      expect(result[0].hoursNow.kind).toBe("listed"); expect(result[0].mayBeClosed).toBe(true);
    }
    expect(hoursState({ ...pharmacy, openNow: false, checkedAt: at }, undefined, 0, at).kind).toBe("closed");
  });
});
