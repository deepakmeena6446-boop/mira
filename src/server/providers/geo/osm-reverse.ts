import "server-only";
import { getEnv } from "@/server/config/env";
import type { GeoPoint } from "./types";

/**
 * Placeholder area names worldwide via a Nominatim-compatible service (OpenStreetMap).
 * Privacy: called from our server (the user's IP never reaches it), with the position
 * rounded to ~1 km, and cached. Respects Nominatim's 1 request/second policy. Mapbox
 * reverse geocoding replaces this when MAPBOX_TOKEN is set.
 */
const cache = new Map<string, string | null>();
const MAX_CACHE = 1000;
let lastCall = 0;

export async function osmAreaName(p: GeoPoint): Promise<string | null> {
  const base = getEnv().REVERSE_GEOCODER_URL;
  if (!base) return null;
  // ~1 km: enough for a suburb/neighbourhood name, and it's all the service ever sees.
  const lat = p.lat.toFixed(2);
  const lon = p.lon.toFixed(2);
  const key = `${lat},${lon}`;
  if (cache.has(key)) return cache.get(key)!;
  if (Date.now() - lastCall < 1000) return null; // over the polite rate: skip, don't queue
  lastCall = Date.now();
  let name: string | null = null;
  let ok = false;
  try {
    const url = new URL("/reverse", base);
    url.search = new URLSearchParams({ lat, lon, format: "jsonv2", zoom: "16", addressdetails: "1", "accept-language": "en" }).toString();
    const res = await fetch(url, { headers: { "user-agent": `MIRA/0.1 (placeholder geocoder; ${getEnv().APP_BASE_URL})` }, signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      ok = true;
      const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
      name = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.village ?? a.town ?? a.city ?? null;
    }
  } catch {
    name = null; // network/timeout: no label is better than a wrong one
  }
  // Only remember real answers: a timeout or 429 shouldn't hide the area name for good.
  if (name !== null || ok) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, name);
  }
  return name;
}
