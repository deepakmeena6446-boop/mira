/**
 * Explicit exception to MIRA's own POST-body rule: the configured Nominatim, Photon and
 * Google Geocoding GET interfaces require location/bias coordinates in the request URL.
 * Callers round before passing values. Never log the returned URL or provider errors that
 * could echo it. The browser talks only to MIRA's POST APIs for these lookups.
 */
export function coordinateBearingGeoUrl(base: string | URL, path: string | null, params: Record<string, string>): URL {
  const url = path === null ? new URL(base) : new URL(path, base);
  url.search = new URLSearchParams(params).toString();
  return url;
}
