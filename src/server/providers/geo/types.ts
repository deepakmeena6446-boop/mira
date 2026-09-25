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
  search(q: string, near?: GeoPoint): Promise<PlaceHit[]>;
  reverse(p: GeoPoint): Promise<{ label: string; precise: boolean }>;
  walk(a: GeoPoint, b: GeoPoint): Promise<WalkRoute>;
  nearby(p: GeoPoint, radiusM: number): Promise<PlaceHit[]>;
}
