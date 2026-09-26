import { describe, expect, it } from "vitest";
import {
  CORRIDOR_M,
  helpClassFromGoogle,
  helpClassFromOsm,
  helpPointsAlongRoute,
  hoursLine,
  isNight,
  isOpen24h,
  minutesIn,
  plausibleHelpPoint,
  projectOnRoute,
  rankHelpPoints,
  samplePointsForRoutes,
  type HelpPoint,
} from "@/domain/help-points";

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
    expect(helpClassFromGoogle(undefined)).toBeNull();
  });

  it("drops PGs, room rentals, labs and dispensaries that map data files as hotels and hospitals", () => {
    expect(plausibleHelpPoint("hotel", "Hotel O White House")).toBe(true);
    expect(plausibleHelpPoint("hotel", "Five Elements Hotels - Delhi")).toBe(true);
    for (const n of ["MY ROOMS 247 Girls pg", "Pg", "OYO Urbans Room", "OYO LIFE DEL1963 Kamla Nagar", "Zostel Hostel"]) expect(plausibleHelpPoint("hotel", n), n).toBe(false);
    expect(plausibleHelpPoint("hospital", "Hindu Rao Hospital")).toBe(true);
    for (const n of ["THYROCARE LAB L-17", "MCD DISPENSARY", "Health Education & Research Council Of india", "City Dental Clinic"]) expect(plausibleHelpPoint("hospital", n), n).toBe(false);
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

  it("describes position and hours without verdicts", () => {
    expect(minutesIn(30)).toBe("at the start");
    expect(minutesIn(750)).toBe("10 min in");
    expect(hoursLine(hp({ id: "a", cls: "pharmacy", lat: 0, lon: 0, open24h: true }))).toBe("Open 24h");
    expect(hoursLine(hp({ id: "a", cls: "pharmacy", lat: 0, lon: 0, hours: "Mo-Sa 09:00-21:00" }))).toBe("Listed hours: Mo-Sa 09:00-21:00");
    expect(hoursLine({ ...hp({ id: "a", cls: "pharmacy", lat: 0, lon: 0 }), mayBeClosed: true })).toBe("Hours not known · may be closed now");
    const all = [hoursLine(hp({ id: "a", cls: "hospital", lat: 0, lon: 0 })), minutesIn(100)].join(" ");
    expect(all).not.toMatch(/\b(safe|unsafe|dangerous|avoid)\b/i);
  });
});

describe("ranking for right now", () => {
  const me = { lat: 28.69, lon: 77.21 };
  const north = (m: number) => 28.69 + m / 111_320;

  it("orders by walking time", () => {
    const r = rankHelpPoints([hp({ id: "b", cls: "police", lat: north(600), lon: 77.21 }), hp({ id: "a", cls: "hospital", lat: north(150), lon: 77.21 })], me, { night: false });
    expect(r.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r[0].minutes).toBeGreaterThanOrEqual(1);
  });

  it("prefers a Tier 1 place when it is within about two minutes of a Tier 2 one", () => {
    const r = rankHelpPoints([hp({ id: "pharmacy", cls: "pharmacy", lat: north(100), lon: 77.21 }), hp({ id: "police", cls: "police", lat: north(180), lon: 77.21 })], me, { night: false });
    expect(r[0].id).toBe("police");
  });

  it("at night, demotes places whose hours matter but aren't known, and labels them", () => {
    const pharmacy = hp({ id: "pharmacy", cls: "pharmacy", lat: north(80), lon: 77.21 });
    const hotel = hp({ id: "hotel", cls: "hotel", lat: north(200), lon: 77.21 });
    expect(rankHelpPoints([pharmacy, hotel], me, { night: false })[0].id).toBe("pharmacy");
    const night = rankHelpPoints([pharmacy, hotel], me, { night: true });
    expect(night[0].id).toBe("hotel");
    expect(night.find((p) => p.id === "pharmacy")!.mayBeClosed).toBe(true);
    // A pharmacy the source says is open 24/7 isn't demoted.
    expect(rankHelpPoints([{ ...pharmacy, open24h: true }, hotel], me, { night: true })[0].id).toBe("pharmacy");
  });

  it("during a trip, prefers places ahead over places behind", () => {
    const mid = { lat: 28.695, lon: 77.21 };
    const behind = hp({ id: "behind", cls: "police", lat: 28.6935, lon: 77.21 });
    const ahead = hp({ id: "ahead", cls: "police", lat: 28.6966, lon: 77.21 });
    const r = rankHelpPoints([behind, ahead], mid, { night: false, route: ROUTE });
    expect(r[0].id).toBe("ahead");
    expect(r[0].ahead).toBe(true);
    expect(r[1].ahead).toBe(false);
  });

  it("is deterministic", () => {
    const pts = [hp({ id: "x", cls: "fuel", lat: north(300), lon: 77.21 }), hp({ id: "y", cls: "hotel", lat: north(300), lon: 77.21 + 0.0001 })];
    expect(rankHelpPoints(pts, me, { night: true })).toEqual(rankHelpPoints([...pts].reverse(), me, { night: true }));
  });
});
