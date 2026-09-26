import type { HelpPoint } from "@/domain/help-points";
import type { TravelMode } from "@/domain/travel-mode";

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

/** A route for any travel mode, with who computed it ("estimate" = straight line, no provider route). */
export interface ModeRoute extends WalkRoute {
  provider: "google" | "osm" | "estimate";
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
  /**
   * Routes for a travel mode, fastest first. Walk: as walkRoutes. Ride / transit: at most one
   * provider route, or none when the provider has none (transit often doesn't exist, or isn't
   * covered): an empty list means "not known", never an error and never a guess.
   */
  routes(a: GeoPoint, b: GeoPoint, mode: TravelMode): Promise<ModeRoute[]>;
  /** Nearby places, optionally limited to kinds (metro, bus, pharmacy, health, police, food, shop, toilets, finance). */
  nearby(p: GeoPoint, radiusM: number, kinds?: string[]): Promise<PlaceHit[]>;
  /**
   * Help Point candidates (src/domain/help-points.ts classes) within `radiusM` of any of the
   * points — one point for "near me", several samples along a route. Classified by the
   * provider from its own place types/tags; hours only as the source states them.
   */
  helpPlaces(points: GeoPoint[], radiusM: number): Promise<HelpPoint[]>;
}
