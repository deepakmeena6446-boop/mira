import type { HelpPoint } from "@/domain/help-points";
import type { Schedule } from "@/domain/opening-hours";

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

export interface Reverse {
  label: string | null;
  precise: boolean;
  country?: string | null;
  region?: string | null;
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
  /**
   * A human place name near the point, or null when unknown — never raw coordinates — plus the
   * country (ISO 3166-1 alpha-2) and state (ISO 3166-2) when known, for the Location Context.
   */
  reverse(p: GeoPoint): Promise<Reverse>;
  walk(a: GeoPoint, b: GeoPoint): Promise<WalkRoute>;
  /** Up to three walking routes, fastest first (one when the provider has no alternatives). */
  walkRoutes(a: GeoPoint, b: GeoPoint): Promise<WalkRoute[]>;
  /** Nearby places, optionally limited to kinds (metro, bus, pharmacy, health, police, food, shop, toilets, finance). */
  nearby(p: GeoPoint, radiusM: number, kinds?: string[]): Promise<PlaceHit[]>;
  /**
   * Help Point candidates (src/domain/help-points.ts classes) within `radiusM` of any of the
   * points — one point for "near me", several samples along a route. Classified by the
   * provider from its own place types/tags; hours only as the source states them (a provider
   * may leave hours out here and give them through `helpHours` for a shortlist).
   */
  helpPlaces(points: GeoPoint[], radiusM: number, opts?: HelpLookupOptions): Promise<HelpPoint[]>;
  /**
   * Opening hours for a few Help Points by id (only ids this provider issued). Optional: a
   * provider without a per-place hours lookup leaves it out. Missing ids = hours not known.
   */
  helpHours?(ids: string[]): Promise<Map<string, HelpHours>>;
}

export interface HelpLookupOptions {
  /** Also look for convenience stores (only where her country turns that class on). */
  convenience?: boolean;
}

/** Hours for one place, as its source lists them. */
export interface HelpHours {
  schedule: Schedule | null;
  /** Listed hours as text (for "listed hours may be out of date" context), or null. */
  text: string | null;
  /** The source's own "open now" and when it said so (epoch ms). */
  openNow?: boolean;
  checkedAt?: number;
}
