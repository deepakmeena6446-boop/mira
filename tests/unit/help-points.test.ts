import { describe, expect, it } from "vitest";
import {
  CORRIDOR_M,
  HELP_CLASSES,
  classWeight,
  emergencyHelpPoints,
  helpClassFromGoogle,
  helpClassFromOsm,
  helpPointsAlongRoute,
  helpWeightsFor,
  hoursLine,
  hoursShort,
  hoursState,
  isNight,
  isOpen24h,
  minutesIn,
  plausibleHelpPoint,
  projectOnRoute,
  rankHelpPoints,
  samplePointsForRoutes,
  type HelpPoint,
} from "@/domain/help-points";
import { parseOpeningHours } from "@/domain/opening-hours";

// A straight ~1.1 km street running north (lon fixed), in [lon, lat] like provider geometry.
const ROUTE: Array<[number, number]> = [
  [77.21, 28.69],
  [77.21, 28.695],
  [77.21, 28.7],
];
const hp = (over: Partial<HelpPoint> & Pick<HelpPoint, "id" | "cls" | "lat" | "lon">): HelpPoint => ({ name: over.id, open24h: false, hours: null, source: "osm", ...over });
const EAST_100M = 0.00102; // ≈ 100 m of longitude at 28.7°N

describe("Help Point classes", () => {
  it("accepts staffed classes and rejects clinics, ATMs, cafés and bus stops", () => {
    expect(helpClassFromOsm({ amenity: "hospital" })).toBe("hospital");
    expect(helpClassFromOsm({ amenity: "police" })).toBe("police");
    expect(helpClassFromOsm({ healthcare: "pharmacy" })).toBe("pharmacy");
    expect(helpClassFromOsm({ railway: "subway_entrance" })).toBe("transit");
    expect(helpClassFromOsm({ tourism: "hotel" })).toBe("hotel");
    expect(helpClassFromOsm({ amenity: "fuel" })).toBe("fuel");
    for (const tags of [{ amenity: "clinic" }, { amenity: "doctors" }, { amenity: "atm" }, { amenity: "cafe" }, { highway: "bus_stop" }, { tourism: "guest_house" }]) {
      expect(helpClassFromOsm(tags)).toBeNull();
    }
    expect(helpClassFromGoogle("subway_station")).toBe("transit");
    expect(helpClassFromGoogle("drugstore")).toBe("pharmacy");
    // Only the primary type counts: a doctor or lab listed with a secondary "hospital" type is not a Help Point.
    expect(helpClassFromGoogle("doctor")).toBeNull();
    expect(helpClassFromGoogle("medical_lab")).toBeNull();
    expect(helpClassFromGoogle("medical_center")).toBeNull(); // Google returns these for "hospital" too
    expect(helpClassFromGoogle(undefined)).toBeNull();
  });

  it("airports and (country-weighted) convenience stores; never bus stops, bus stations, ATMs or cafés", () => {
    expect(helpClassFromGoogle("airport")).toBe("airport");
    expect(helpClassFromGoogle("international_airport")).toBe("airport");
    expect(helpClassFromGoogle("convenience_store")).toBe("convenience");
    for (const t of ["bus_stop", "bus_station", "transit_station", "atm", "bank", "cafe", "doctor"]) expect(helpClassFromGoogle(t), t).toBeNull();
    expect(helpClassFromOsm({ aeroway: "aerodrome", iata: "LHR" })).toBe("airport");
    expect(helpClassFromOsm({ aeroway: "aerodrome", aerodrome: "international" })).toBe("airport");
    expect(helpClassFromOsm({ aeroway: "aerodrome" })).toBeNull(); // airstrips, flying clubs
    expect(helpClassFromOsm({ aeroway: "helipad" })).toBeNull();
    expect(helpClassFromOsm({ shop: "convenience" })).toBe("convenience");
    expect(helpClassFromOsm({ amenity: "bus_station" })).toBeNull();
    expect(helpClassFromOsm({ shop: "chemist" })).toBeNull();
    // Convenience stores are off unless her country turns them on.
    expect(HELP_CLASSES.convenience.weight).toBe(0);
    expect(classWeight("convenience")).toBe(0);
    expect(classWeight("convenience", helpWeightsFor("JP"))).toBeGreaterThan(0);
    // Class copy never promises staffing.
    for (const c of Object.values(HELP_CLASSES)) expect(c.staffing).not.toMatch(/\b(staffed|safe)\b/i);
  });

  it("drops PGs, room rentals, labs and dispensaries that map data files as hotels and hospitals", () => {
    expect(plausibleHelpPoint("hotel", "Hotel O White House")).toBe(true);
    expect(plausibleHelpPoint("hotel", "Five Elements Hotels - Delhi")).toBe(true);
    for (const n of ["MY ROOMS 247 Girls pg", "Pg", "OYO Urbans Room", "OYO LIFE DEL1963 Kamla Nagar", "Zostel Hostel"]) expect(plausibleHelpPoint("hotel", n), n).toBe(false);
    expect(plausibleHelpPoint("hospital", "Hindu Rao Hospital")).toBe(true);
    for (const n of ["THYROCARE LAB L-17", "MCD DISPENSARY", "Health Education & Research Council Of india", "City Dental Clinic", "Marksonoz pharmaceuticals limited", "Maisie braces", "D.Najat clinice"]) {
      expect(plausibleHelpPoint("hospital", n), n).toBe(false);
    }
    expect(plausibleHelpPoint("hospital", "Rashid Hospital")).toBe(true);
    expect(plausibleHelpPoint("police", "Police Station Maurice Nagar")).toBe(true);
  });

  it("counts a place as open 24h only when the source says exactly that", () => {
    expect(isOpen24h("24/7")).toBe(true);
    expect(isOpen24h("Mo-Su 00:00-24:00")).toBe(false); // not parsed at P0: stays "listed hours"
    expect(isOpen24h(null)).toBe(false);
  });

  it("uses the same evening/night window as the lighting question", () => {
    expect([17, 18, 23, 0, 5, 6].map(isNight)).toEqual([false, true, true, true, true, false]);
  });
});

describe("Help Points along a route", () => {
  it("projects a point onto the route (metres along, metres off)", () => {
    const at = projectOnRoute({ lat: 28.695, lon: 77.21 + EAST_100M }, ROUTE);
    expect(at.alongM).toBeGreaterThan(530);
    expect(at.alongM).toBeLessThan(580);
    expect(at.offM).toBeGreaterThan(90);
    expect(at.offM).toBeLessThan(110);
  });

  it("keeps only places inside the corridor, in the order she'd pass them, without duplicates", () => {
    const along = helpPointsAlongRoute(
      [
        hp({ id: "late", cls: "pharmacy", lat: 28.699, lon: 77.21 }),
        hp({ id: "early", cls: "police", lat: 28.6905, lon: 77.21 + EAST_100M }),
        hp({ id: "far", cls: "hospital", lat: 28.695, lon: 77.21 + EAST_100M * 4 }),
        hp({ id: "early-copy", name: "early", cls: "police", lat: 28.69052, lon: 77.21 + EAST_100M }),
      ],
      ROUTE,
    );
    expect(along.map((p) => p.id)).toEqual(["early", "late"]);
    expect(along[0].alongM).toBeLessThan(along[1].alongM!);
    expect(CORRIDOR_M).toBeLessThan(400);
  });

  it("samples a few lookup points per route, shared between overlapping alternatives, and capped", () => {
    const one = samplePointsForRoutes([ROUTE]);
    expect(one.length).toBeGreaterThanOrEqual(2);
    const both = samplePointsForRoutes([ROUTE, ROUTE.map(([x, y]) => [x + 0.0001, y] as [number, number])]);
    expect(both.length).toBe(one.length); // the alternative runs alongside: no extra lookups
    const long: Array<[number, number]> = [
      [77.2, 28.6],
      [77.2, 28.8],
    ];
    expect(samplePointsForRoutes([long]).length).toBe(5);
  });

  it("describes position without verdicts", () => {
    expect(minutesIn(30)).toBe("at the start");
    expect(minutesIn(750)).toBe("10 min in");
    const all = [hoursLine(hp({ id: "a", cls: "hospital", lat: 0, lon: 0 })), minutesIn(100)].join(" ");
    expect(all).not.toMatch(/\b(safe|unsafe|dangerous|avoid|staffed)\b/i);
  });
});

describe("hours states and their copy (always with the source; never 'staffed')", () => {
  const monNoon = { day: 0, minute: 12 * 60 };
  const AT = Date.UTC(2026, 8, 28, 12, 0); // any fixed device time; only freshness is judged from it
  const at = (p: HelpPoint, now = monNoon, arrive = 1) => {
    const h = hoursState(p, now, arrive, AT);
    return hoursLine({ ...p, hoursNow: h });
  };
  const base = hp({ id: "a", cls: "pharmacy", lat: 0, lon: 0 });

  it("open 24 hours (listed)", () => {
    expect(at({ ...base, open24h: true, source: "google" })).toBe("Open 24 hours (listed) · Google");
    expect(at({ ...base, schedule: parseOpeningHours("Mo-Su 00:00-24:00") })).toBe("Open 24 hours (listed) · OpenStreetMap");
    expect(hoursLine({ ...base, open24h: true })).toBe("Open 24 hours (listed) · OpenStreetMap"); // no clock needed
  });

  it("open now, as the source itself says (while fresh), else the listed hours decide", () => {
    const g = { ...base, source: "google" as const, schedule: parseOpeningHours("Mo-Su 08:00-21:00"), openNow: true, checkedAt: AT - 5 * 60_000 };
    expect(at(g)).toBe("Open now, listed until 9 PM · Google");
    expect(at({ ...g, schedule: null })).toBe("Open now · Google");
    expect(hoursState({ ...g, schedule: null }, monNoon, 1, AT).kind).toBe("open_now");
    // Stale "open now" (an hour old): only the listed hours count.
    expect(at({ ...g, checkedAt: AT - 60 * 60_000 })).toBe("Listed 8 AM–9 PM · Google");
    expect(hoursState({ ...g, schedule: null, checkedAt: AT - 60 * 60_000 }, monNoon, 1, AT).kind).toBe("unknown");
    // The source says closed now (e.g. a holiday), though the regular hours say open.
    expect(at({ ...g, openNow: false })).toBe("Closed now · Google");
  });

  it("listed hours, closing before she'd get there, closed, listed-but-unreadable, not known", () => {
    const listed = { ...base, schedule: parseOpeningHours("Mo-Sa 09:00-21:00"), hours: "Mo-Sa 09:00-21:00" };
    expect(at(listed)).toBe("Listed 9 AM–9 PM · OpenStreetMap");
    expect(at(listed, { day: 0, minute: 20 * 60 + 55 }, 10)).toBe("Closes 9 PM, before you'd get there (listed) · OpenStreetMap");
    expect(at(listed, { day: 6, minute: 12 * 60 })).toBe("Closed now (listed hours) · OpenStreetMap");
    expect(at({ ...base, hours: "sunrise-sunset" })).toBe("Listed: sunrise-sunset · OpenStreetMap");
    expect(at(base)).toBe("Hours not known");
    expect(hoursLine({ ...base, hoursNow: { kind: "unknown" }, mayBeClosed: true })).toBe("Hours not known · may be closed now");
    // Overnight listed hours that began yesterday evening.
    expect(at({ ...base, schedule: parseOpeningHours("18:00-06:00") }, { day: 1, minute: 60 })).toBe("Listed 6 PM–6 AM · OpenStreetMap");
    // Without the device clock, parsed hours are shown as listed text or "not known" — never as open.
    expect(hoursLine(listed)).toBe("Listed: Mo-Sa 09:00-21:00 · OpenStreetMap");
  });

  it("short forms for compact rows", () => {
    expect(hoursShort({ kind: "open_now", source: "google", closesAt: null })).toBe("open now");
    expect(hoursShort({ kind: "open_24h", source: "osm" })).toBe("open 24 h (listed)");
    expect(hoursShort({ kind: "unknown" }, true)).toBe("may be closed");
  });
});

describe("ranking for right now", () => {
  const me = { lat: 28.69, lon: 77.21 };
  const north = (m: number) => 28.69 + m / 111_320;
  const monNoon = { day: 0, minute: 12 * 60 };
  const monLate = { day: 0, minute: 23 * 60 };
  const AT = Date.UTC(2026, 8, 28, 12, 0);
  const dayOpts = { night: false, now: monNoon, at: AT } as const;

  it("orders by walking time", () => {
    const r = rankHelpPoints([hp({ id: "b", cls: "police", lat: north(600), lon: 77.21 }), hp({ id: "a", cls: "hospital", lat: north(150), lon: 77.21 })], me, { situation: "nearby", night: false });
    expect(r.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r[0].minutes).toBeGreaterThanOrEqual(1);
  });

  it("police is one category, not first by default: a closer open pharmacy or hospital comes first (nearby, unsafe, route)", () => {
    const pharmacy = hp({ id: "pharmacy", cls: "pharmacy", lat: north(100), lon: 77.21, schedule: parseOpeningHours("Mo-Sa 09:00-21:00") });
    const hospital = hp({ id: "hospital", cls: "hospital", lat: north(150), lon: 77.21 });
    const police = hp({ id: "police", cls: "police", lat: north(250), lon: 77.21 });
    for (const situation of ["nearby", "unsafe", "route"] as const) {
      expect(rankHelpPoints([police, hospital, pharmacy], me, { situation, ...dayOpts }).map((p) => p.id), situation).toEqual(["pharmacy", "hospital", "police"]);
    }
    // Same distance: no class is lifted over another just for being police.
    const policeSame = { ...police, lat: north(150) };
    expect(rankHelpPoints([policeSame, hospital], me, { situation: "unsafe", ...dayOpts }).map((p) => p.id)).toEqual(["hospital", "police"]); // tie → name
  });

  it("in an emergency, police and hospitals are promoted", () => {
    const pharmacy = hp({ id: "pharmacy", cls: "pharmacy", lat: north(100), lon: 77.21, schedule: parseOpeningHours("Mo-Sa 09:00-21:00") });
    const police = hp({ id: "police", cls: "police", lat: north(250), lon: 77.21 });
    const hospital = hp({ id: "hospital", cls: "hospital", lat: north(300), lon: 77.21 });
    expect(rankHelpPoints([pharmacy, police, hospital], me, { situation: "emergency", ...dayOpts }).map((p) => p.id)).toEqual(["police", "hospital", "pharmacy"]);
    // The helper does the same on the device clock; her exclusions still hold.
    const monNoonDate = new Date(2026, 8, 28, 12, 0); // a Monday, local time
    expect(emergencyHelpPoints([pharmacy, police, hospital], me, { now: monNoonDate }).map((p) => p.id)).toEqual(["police", "hospital", "pharmacy"]);
    expect(emergencyHelpPoints([pharmacy, police, hospital], me, { now: monNoonDate, exclude: ["police"] }).map((p) => p.id)).toEqual(["hospital", "pharmacy"]);
    // Promotion is bounded: a hospital an hour's walk away doesn't beat an open pharmacy next door.
    const farHospital = { ...hospital, lat: north(4000) };
    expect(rankHelpPoints([pharmacy, farHospital], me, { situation: "emergency", ...dayOpts })[0].id).toBe("pharmacy");
  });

  it("prefers places likely open now: open now/24 h > listed open > not known by day > not known at night", () => {
    const d = (m: number) => ({ lat: north(m), lon: 77.21 });
    const openNow = hp({ id: "open-now", cls: "pharmacy", ...d(300), source: "google", openNow: true, checkedAt: AT - 60_000 });
    const listedOpen = hp({ id: "listed-open", cls: "pharmacy", ...d(300), schedule: parseOpeningHours("Mo-Su 08:00-22:00") });
    const unknown = hp({ id: "unknown", cls: "pharmacy", ...d(300) });
    const r = rankHelpPoints([unknown, listedOpen, openNow], me, { situation: "nearby", ...dayOpts });
    expect(r.map((p) => p.id)).toEqual(["open-now", "listed-open", "unknown"]);
    expect(r.map((p) => p.hoursNow.kind)).toEqual(["open_now", "listed_open", "unknown"]);
    // But walking time still dominates: an unknown-hours place much closer comes first by day.
    expect(rankHelpPoints([openNow, { ...unknown, ...d(40) }], me, { situation: "nearby", ...dayOpts })[0].id).toBe("unknown");
  });

  it("at night, demotes places whose hours matter but aren't known, and labels them", () => {
    const pharmacy = hp({ id: "pharmacy", cls: "pharmacy", lat: north(80), lon: 77.21 });
    const hotel = hp({ id: "hotel", cls: "hotel", name: "Hotel Night", lat: north(200), lon: 77.21 });
    expect(rankHelpPoints([pharmacy, hotel], me, { situation: "nearby", night: false })[0].id).toBe("pharmacy");
    const night = rankHelpPoints([pharmacy, hotel], me, { situation: "unsafe", night: true, now: monLate, at: AT });
    expect(night[0].id).toBe("hotel");
    expect(night.find((p) => p.id === "pharmacy")!.mayBeClosed).toBe(true);
    expect(night.find((p) => p.id === "hotel")!.mayBeClosed).toBe(false);
    // A pharmacy the source lists as open 24 hours isn't demoted.
    expect(rankHelpPoints([{ ...pharmacy, open24h: true }, hotel], me, { situation: "unsafe", night: true, now: monLate, at: AT })[0].id).toBe("pharmacy");
  });

  it("leaves out places closed now (listed or source-stated) and places closing before she'd arrive", () => {
    const listedClosed = hp({ id: "listed-closed", cls: "pharmacy", lat: north(100), lon: 77.21, schedule: parseOpeningHours("Mo-Sa 09:00-21:00") });
    const saysClosed = hp({ id: "says-closed", cls: "hospital", lat: north(100), lon: 77.21, source: "google", open24h: true, openNow: false, checkedAt: AT - 60_000 });
    const closing = hp({ id: "closing", cls: "fuel", lat: north(600), lon: 77.21, schedule: parseOpeningHours("Mo-Su 06:00-12:05") });
    expect(rankHelpPoints([listedClosed], me, { situation: "nearby", night: true, now: monLate, at: AT })).toEqual([]);
    expect(rankHelpPoints([saysClosed, closing], me, { situation: "nearby", ...dayOpts })).toEqual([]);
  });

  it("during a trip, prefers places ahead over places behind — most strongly while browsing the route", () => {
    const mid = { lat: 28.695, lon: 77.21 };
    const behind = hp({ id: "behind", cls: "police", lat: 28.6935, lon: 77.21 });
    const ahead = hp({ id: "ahead", cls: "police", lat: 28.6966, lon: 77.21 });
    const r = rankHelpPoints([behind, ahead], mid, { situation: "unsafe", night: false, route: ROUTE });
    expect(r[0].id).toBe("ahead");
    expect(r[0].ahead).toBe(true);
    expect(r[1].ahead).toBe(false);
    // A place a little closer but behind her loses to one ahead on the route.
    const closeBehind = hp({ id: "close-behind", cls: "hospital", lat: 28.6941, lon: 77.21 });
    const furtherAhead = hp({ id: "further-ahead", cls: "hospital", lat: 28.6972, lon: 77.21 });
    expect(rankHelpPoints([closeBehind, furtherAhead], mid, { situation: "route", night: false, route: ROUTE })[0].id).toBe("further-ahead");
    expect(rankHelpPoints([closeBehind, furtherAhead], mid, { situation: "nearby", night: false })[0].id).toBe("close-behind");
  });

  it("honours her exclusions and (for later) her own preferences", () => {
    const police = hp({ id: "police", cls: "police", lat: north(100), lon: 77.21 });
    const hotel = hp({ id: "hotel", cls: "hotel", name: "Grand Hotel", lat: north(100), lon: 77.21 });
    expect(rankHelpPoints([police, hotel], me, { situation: "unsafe", night: false, exclude: ["police"] }).map((p) => p.id)).toEqual(["hotel"]);
    expect(rankHelpPoints([police, hotel], me, { situation: "unsafe", night: false, prefer: { police: 0 } }).map((p) => p.id)).toEqual(["hotel"]);
    expect(rankHelpPoints([police, hotel], me, { situation: "unsafe", night: false }).map((p) => p.id)).toEqual(["police", "hotel"]); // class weight tie-break
    expect(rankHelpPoints([police, hotel], me, { situation: "unsafe", night: false, prefer: { police: 0.5 } }).map((p) => p.id)).toEqual(["hotel", "police"]);
  });

  it("country weights: convenience stores are off by default and on where a country turns them on", () => {
    const store = hp({ id: "store", cls: "convenience", lat: north(60), lon: 77.21, open24h: true });
    const station = hp({ id: "station", cls: "transit", lat: north(400), lon: 77.21 });
    expect(helpWeightsFor("GB")).toEqual({});
    expect(rankHelpPoints([store, station], me, { situation: "unsafe", night: true, now: monLate, at: AT }).map((p) => p.id)).toEqual(["station"]);
    expect(rankHelpPoints([store, station], me, { situation: "unsafe", night: true, now: monLate, at: AT, weights: helpWeightsFor("jp") }).map((p) => p.id)).toEqual(["store", "station"]);
    expect(classWeight("convenience", helpWeightsFor("TH"))).toBeGreaterThan(0);
    // A small tie-break only: India weights fuel stations like hotel receptions.
    const fuel = hp({ id: "fuel", cls: "fuel", name: "A Fuel", lat: north(200), lon: 77.21 });
    const hotel = hp({ id: "hotel", cls: "hotel", name: "Z Hotel", lat: north(200), lon: 77.21 });
    expect(rankHelpPoints([fuel, hotel], me, { situation: "nearby", night: false })[0].id).toBe("hotel");
    expect(rankHelpPoints([fuel, hotel], me, { situation: "nearby", night: false, weights: helpWeightsFor("IN") })[0].id).toBe("fuel"); // equal weight → name
  });

  it("is deterministic", () => {
    const pts = [hp({ id: "x", cls: "fuel", lat: north(300), lon: 77.21 }), hp({ id: "y", cls: "hotel", name: "Hotel Y", lat: north(300), lon: 77.21 + 0.0001 })];
    for (const situation of ["route", "nearby", "unsafe", "emergency"] as const) {
      expect(rankHelpPoints(pts, me, { situation, night: true })).toEqual(rankHelpPoints([...pts].reverse(), me, { situation, night: true }));
    }
  });
});
