import { describe, expect, it } from "vitest";
import { contextLine, helpPointItems, lightingItems, noteItem } from "@/domain/context";
import { routeLighting } from "@/domain/lighting";
import { rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { parseOpeningHours } from "@/domain/opening-hours";

const VERDICTS = /\b(safe|safer|safest|unsafe|dangerous|danger|risky|avoid|crime)\b/i;
const ROUTE: Array<[number, number]> = [
  [77.21, 28.69],
  [77.21, 28.692],
];

describe("context items (read-model)", () => {
  it("turns lighting into sourced, dated items with their unknowns, and templates never judge", () => {
    const l = routeLighting(ROUTE, { walkers: [], ways: [{ lit: "yes", coords: ROUTE, editedYear: 2017 }], poles: [] });
    expect(l.freshness).toEqual({ osmFrom: 2017, osmTo: 2017 });
    const items = lightingItems(l);
    expect(items[0]).toMatchObject({ claim: "lighting", source: { id: "osm" }, observedAt: "2017", confidence: "single_source" });
    expect(items[0].unknowns.join(" ")).toMatch(/not known|tonight/);
    const lines = [...items, ...lightingItems(null), ...lightingItems(routeLighting(ROUTE, { walkers: [], ways: [], poles: [] }))].map(contextLine);
    expect(lines[0]).toBe("100% mapped as lit (OpenStreetMap, 2017).");
    for (const line of lines) expect(line).not.toMatch(VERDICTS);
  });

  it("Help Points and released notes become items too; still no verdict words", () => {
    const hp: HelpPoint = { id: "h1", name: "Hindu Rao Hospital", cls: "hospital", lat: 28.69, lon: 77.21, open24h: false, hours: null, source: "google" };
    const items = [...helpPointItems([hp]), noteItem({ id: "n1", text: "Multiple reviewed observations mention poor lighting in this area during the evening.", week: "2026-09-21" })];
    expect(items[0].unknowns).toContain("hours not known");
    expect(items[1]).toMatchObject({ confidence: "corroborated", subject: { kind: "area", precisionM: 1200 } });
    for (const i of items) expect(contextLine(i)).not.toMatch(VERDICTS);
  });
});

describe("Help Points with listed hours and her filters", () => {
  const me = { lat: 28.69, lon: 77.21 };
  const near = (id: string, over: Partial<HelpPoint>): HelpPoint => ({ id, name: id, cls: "pharmacy", lat: 28.6905, lon: 77.21, open24h: false, hours: null, source: "osm", ...over });
  const mondayNoon = { day: 0, minute: 12 * 60 };
  const mondayLate = { day: 0, minute: 23 * 60 };

  it("leaves out places listed as closed now, or closing before she'd get there", () => {
    const shop = near("day-pharmacy", { schedule: parseOpeningHours("Mo-Sa 09:00-21:00") });
    expect(rankHelpPoints([shop], me, { situation: "nearby", night: false, now: mondayNoon })[0].open.state).toBe("open");
    expect(rankHelpPoints([shop], me, { situation: "nearby", night: true, now: mondayLate })).toEqual([]);
    const closing = near("closing", { schedule: parseOpeningHours("Mo-Su 08:00-12:01") });
    expect(rankHelpPoints([closing], me, { situation: "nearby", night: false, now: mondayNoon })).toEqual([]); // ~1 min walk, closes in 1: she wouldn't make it
  });

  it("does not demote a place listed as open at night", () => {
    const allNight = near("all-night", { schedule: parseOpeningHours("18:00-06:00") });
    const unknown = near("unknown-hours", { lat: 28.6904 });
    const r = rankHelpPoints([unknown, allNight], me, { situation: "nearby", night: true, now: mondayLate });
    expect(r[0].id).toBe("all-night");
    expect(r[1].mayBeClosed).toBe(true);
  });

  it("honours her filters (e.g. no police)", () => {
    const police = near("police", { cls: "police" });
    const pharmacy = near("pharmacy", {});
    expect(rankHelpPoints([police, pharmacy], me, { situation: "nearby", night: false, exclude: ["police"] }).map((p) => p.id)).toEqual(["pharmacy"]);
  });
});
