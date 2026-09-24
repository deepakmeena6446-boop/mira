/**
 * TEST-ONLY SYNTHETIC FIXTURE. These are not real places or streets and must never be
 * loaded by the running application (the production importer refuses test-only
 * manifests). Coordinates sit inside the pilot rectangle so bounds checks pass.
 *
 * Layout: a 4×4 street grid (~100 m spacing) with ids 1..16:
 *
 *   13 — 14 — 15 — 16      row 3 (north)
 *    |    |    |    |
 *    9 — 10 — 11 — 12      row 2
 *    |    |    |    |
 *    5 —  6 —  7 —  8      row 1
 *    |    |    |    |
 *    1 —  2 —  3 —  4      row 0 (south)
 *
 * Extras: footway 1→6 marked foot=no (excluded); one-way footway 4→7 (forward only);
 * island way 50—51 (disconnected); way 60—61—62 where 62 lies outside the pilot.
 */
import type { OsmElement, OsmNode, OsmWay } from "@/domain/osm";

export const FIXTURE_ORIGIN = { lat: 28.69, lon: 77.21 };
export const DLAT = 0.0009; // ≈100 m
export const DLON = 0.00102; // ≈100 m at 28.69° N

export function gridNodeId(row: number, col: number): number {
  return row * 4 + col + 1;
}

export function buildGridFixture(): OsmElement[] {
  const nodes: OsmNode[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      nodes.push({ type: "node", id: gridNodeId(r, c), lat: FIXTURE_ORIGIN.lat + r * DLAT, lon: FIXTURE_ORIGIN.lon + c * DLON });
    }
  }
  nodes.push({ type: "node", id: 50, lat: 28.7, lon: 77.222 });
  nodes.push({ type: "node", id: 51, lat: 28.7009, lon: 77.222 });
  nodes.push({ type: "node", id: 60, lat: 28.6865, lon: 77.203 });
  nodes.push({ type: "node", id: 61, lat: 28.6858, lon: 77.203 });
  nodes.push({ type: "node", id: 62, lat: 28.684, lon: 77.203 }); // south of pilot
  // Places
  nodes.push({ type: "node", id: 100, lat: 28.6901, lon: 77.2111, tags: { amenity: "pharmacy", name: "Fixture Pharmacy", opening_hours: "Mo-Sa 09:00-21:00" } });
  nodes.push({ type: "node", id: 101, lat: 28.6919, lon: 77.2121, tags: { highway: "bus_stop" } });
  nodes.push({ type: "node", id: 102, lat: 28.6905, lon: 77.2105, tags: { amenity: "bench" } });
  nodes.push({ type: "node", id: 103, lat: 28.6912, lon: 77.2101, tags: { shop: "chemist", name: "Fixture Toiletries" } });
  nodes.push({ type: "node", id: 104, lat: 28.6915, lon: 77.2115, tags: { amenity: "cafe" } }); // unnamed cafe: excluded
  nodes.push({ type: "node", id: 105, lat: 28.683, lon: 77.21, tags: { amenity: "pharmacy", name: "Outside Pharmacy" } }); // outside pilot
  nodes.push({ type: "node", id: 106, lat: 28.6926, lon: 77.2131, tags: { railway: "subway_entrance", name: "Fixture Metro Gate 1" } });
  nodes.push({ type: "node", id: 110, lat: 28.6935, lon: 77.2140 });
  nodes.push({ type: "node", id: 111, lat: 28.6935, lon: 77.2150 });
  nodes.push({ type: "node", id: 112, lat: 28.6945, lon: 77.2150 });
  nodes.push({ type: "node", id: 113, lat: 28.6945, lon: 77.2140 });

  const ways: OsmWay[] = [];
  let wid = 1000;
  for (let r = 0; r < 4; r++) {
    ways.push({ type: "way", id: wid++, nodes: [0, 1, 2, 3].map((c) => gridNodeId(r, c)), tags: { highway: "residential", name: `Fixture Row ${r}` } });
  }
  for (let c = 0; c < 4; c++) {
    ways.push({ type: "way", id: wid++, nodes: [0, 1, 2, 3].map((r) => gridNodeId(r, c)), tags: { highway: "residential", name: `Fixture Col ${c}` } });
  }
  ways.push({ type: "way", id: 2001, nodes: [1, 6], tags: { highway: "footway", foot: "no" } });
  ways.push({ type: "way", id: 2002, nodes: [4, 7], tags: { highway: "footway", oneway: "yes" } });
  ways.push({ type: "way", id: 2003, nodes: [50, 51], tags: { highway: "footway" } });
  ways.push({ type: "way", id: 2004, nodes: [60, 61, 62], tags: { highway: "service" } });
  ways.push({ type: "way", id: 2005, nodes: [5, 9], tags: { highway: "service", access: "private" } });
  ways.push({ type: "way", id: 3001, nodes: [110, 111, 112, 113, 110], tags: { amenity: "college", name: "Fixture College" } });
  return [...nodes, ...ways];
}
