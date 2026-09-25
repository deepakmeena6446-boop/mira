export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface PlaceHit {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distanceM?: number;
  hours?: string | null;
}

export interface WalkRoute {
  meters: number;
  minutes: number;
  geometry: Array<[number, number]>; // [lon, lat]
  /** True when no walking network was available and the route is a straight-line estimate. */
  approximate: boolean;
}

/** Everything MIRA needs from a maps provider. Mapbox implements this later. */
export interface GeoProvider {
  /** `deep`: an explicit search (Enter) — may use slower, more thorough sources. */
  search(q: string, near?: GeoPoint, opts?: { deep?: boolean }): Promise<PlaceHit[]>;
  /** A human place name near the point, or null when unknown — never raw coordinates. */
  reverse(p: GeoPoint): Promise<{ label: string | null; precise: boolean }>;
  walk(a: GeoPoint, b: GeoPoint): Promise<WalkRoute>;
  /** Nearby places, optionally limited to kinds (metro, bus, pharmacy, health, police, food, shop, toilets, finance). */
  nearby(p: GeoPoint, radiusM: number, kinds?: string[]): Promise<PlaceHit[]>;
}
