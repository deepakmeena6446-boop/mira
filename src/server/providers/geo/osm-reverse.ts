import "server-only";
import { getEnv } from "@/server/config/env";
import { coordinateBearingGeoUrl } from "./coordinate-url";
import type { GeoPoint } from "./types";

/**
 * Placeholder area names worldwide via a Nominatim-compatible service (OpenStreetMap).
 * Privacy: called from our server (the user's IP never reaches it), with the position
 * rounded to ~1 km, and cached. Respects Nominatim's 1 request/second policy. Mapbox
 * reverse geocoding replaces this when MAPBOX_TOKEN is set.
 */
type Area = { name: string | null; country: string | null; region: string | null };
const cache = new Map<string, Area>();
const MAX_CACHE = 1000;
let lastCall = 0;

export async function osmAreaName(p: GeoPoint): Promise<string | null> {
  return (await osmArea(p))?.name ?? null;
}

/** Area name plus country (ISO 3166-1) and state (ISO 3166-2), for the Location Context. */
export async function osmArea(p: GeoPoint): Promise<Area | null> {
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
  let country: string | null = null;
  let region: string | null = null;
  let ok = false;
  try {
    const url = coordinateBearingGeoUrl(base, "/reverse", { lat, lon, format: "jsonv2", zoom: "16", addressdetails: "1", "accept-language": "en" });
    const res = await fetch(url, { headers: { "user-agent": `MIRA/0.1 (placeholder geocoder; ${getEnv().APP_BASE_URL})` }, signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      ok = true;
      const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
      name = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.village ?? a.town ?? a.city ?? null;
      country = a.country_code ? a.country_code.toUpperCase().slice(0, 2) : null;
      region = a["ISO3166-2-lvl4"] ?? a["ISO3166-2-lvl3"] ?? null;
    }
  } catch {
    name = null; // network/timeout: no label is better than a wrong one
  }
  // Only remember real answers: a timeout or 429 shouldn't hide the area name for good.
  const area = { name, country, region };
  if (name !== null || ok) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, area);
  }
  return area;
}

/** Wait for our turn under Nominatim's 1 request/second rule (only for explicit searches). */
async function nominatimTurn(maxWaitMs = 1500): Promise<boolean> {
  const wait = lastCall + 1000 - Date.now();
  if (wait > maxWaitMs) return false;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return true;
}

const searchCache = new Map<string, { at: number; hits: PlaceHitLite[] }>();
export interface PlaceHitLite {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
}

/**
 * Deeper lookup when someone presses Enter/Search (addresses, exact names). Nominatim's
 * policy allows explicit searches but not search-as-you-type, so this is never called
 * per keystroke. Biased to ~50 km around a rounded position; cached for an hour.
 */
export async function nominatimSearch(q: string, near?: GeoPoint): Promise<PlaceHitLite[]> {
  const base = getEnv().REVERSE_GEOCODER_URL;
  if (!base) return [];
  const c = near ? { lat: Number(near.lat.toFixed(2)), lon: Number(near.lon.toFixed(2)) } : null;
  const key = `${q.toLowerCase()}|${c ? `${c.lat},${c.lon}` : ""}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.hits;
  if (!(await nominatimTurn())) return [];
  try {
    const params: Record<string, string> = { q, format: "jsonv2", limit: "8", addressdetails: "1", "accept-language": "en" };
    if (c) params.viewbox = `${c.lon - 0.5},${c.lat + 0.5},${c.lon + 0.5},${c.lat - 0.5}`; // bias, not a hard bound
    const url = coordinateBearingGeoUrl(base, "/search", params);
    const res = await fetch(url, { headers: { "user-agent": `MIRA/0.1 (placeholder geocoder; ${getEnv().APP_BASE_URL})` }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    type R = { osm_type?: string; osm_id?: number; lat: string; lon: string; name?: string; display_name: string; type?: string; address?: Record<string, string> };
    const rows = (await res.json()) as R[];
    const hits = rows.map((r) => {
      const a = r.address ?? {};
      const name = r.name || r.display_name.split(",")[0];
      const where = [a.suburb ?? a.neighbourhood ?? a.city_district, a.city ?? a.town ?? a.village].filter((x) => x && x !== name).join(", ");
      const kind = [r.type && r.type !== "yes" ? r.type.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase()) : null, where].filter(Boolean).join(" · ") || "Place";
      return { id: `osm:${r.osm_type ?? "x"}/${r.osm_id ?? `${r.lat},${r.lon}`}`, name, kind, lat: Number(r.lat), lon: Number(r.lon) };
    });
    if (searchCache.size >= MAX_CACHE) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(key, { at: Date.now(), hits });
    return hits;
  } catch {
    return [];
  }
}
