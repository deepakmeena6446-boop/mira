import { describe, expect, it } from "vitest";
import { aboutIn } from "@/domain/daylight";
import { daylightClaim, helpClaim } from "@/lib/brief";
import { parseOpeningHours } from "@/domain/opening-hours";
import type { HelpPoint } from "@/domain/help-points";

// design/mira-companion-ux: a chosen place's clock is its own zone or nothing. While the zone is checked, or when it
// can't be found, daylight is said from now (no zone needed) and listed hours aren't read on another zone's clock.
const lisbon = { lat: 38.7139, lon: -9.1394 };
const at = new Date("2026-10-10T17:50:00Z"); // 6:50 PM in Lisbon, 11:20 PM in Kolkata
const CLOCK = /\d{1,2}:\d{2}\s?(AM|PM)/;
const pharmacy: HelpPoint = { id: "osm:p", name: "Pharmacy", cls: "pharmacy", lat: 38.714, lon: -9.139, open24h: false, hours: "Mo-Su 09:00-21:00", schedule: parseOpeningHours("Mo-Su 09:00-21:00"), source: "osm" };
const ready = { state: "ready" as const, sources: [{ source: "OpenStreetMap", state: "ready" as const }], data: [pharmacy] };

describe("aboutIn", () => {
  it("says a change from now without any clock", () => {
    expect(aboutIn(at, new Date(at.getTime() + 2 * 60_000))).toBe("in a few minutes");
    expect(aboutIn(at, new Date(at.getTime() + 23 * 60_000))).toBe("in about 25 min");
    expect(aboutIn(at, new Date(at.getTime() + 11.6 * 3_600_000))).toBe("in about 12 h");
  });
});

describe("daylightClaim with the place's clock", () => {
  it("gives the change as the place's clock time once its zone is known", () => {
    const c = daylightClaim(at, lisbon, "Europe/Lisbon", "now");
    expect(c.claim).toBe("Daylight now · changes about 6:55 PM"); // Lisbon's clock (it would be 11:25 PM on Kolkata's)
    expect(c.source).toBe("Solar calculation");
  });

  it.each(["checking", "unknown"] as const)("while the zone is %s, says the change from now and no clock time at all", (clock) => {
    const c = daylightClaim(at, lisbon, null, "now", clock);
    expect(c.claim).toMatch(/^(Daylight|Twilight) now · (dark|twilight|changes) in (about \d+ (min|h)|a few minutes)$/);
    expect(c.claim).not.toMatch(CLOCK);
    expect(c.kind).toBe("checked"); // the solar calculation itself needs no zone
    expect(c.source).toContain(clock === "checking" ? "checking this place’s local time" : "this place’s local time isn’t known");
  });
});

describe("helpClaim with the place's clock", () => {
  it("counts what's open from listed hours on the place's own clock", () => {
    expect(helpClaim([pharmacy], ready, { day: 5, minute: 18 * 60 + 50 }, "within a short walk of it", "now").claim).toContain("1 open now");
  });

  it("doesn't read listed hours without that clock, and says why", () => {
    const checking = helpClaim([pharmacy], ready, null, "within a short walk of it", "now", "checking").claim;
    const unknown = helpClaim([pharmacy], ready, null, "within a short walk of it", "now", "unknown").claim;
    expect(checking).toContain("opening hours wait for this place’s local time");
    expect(unknown).toContain("opening hours not checked: this place’s local time isn’t known");
    for (const line of [checking, unknown]) expect(line).not.toMatch(/\bopen now\b|closed/);
  });
});
