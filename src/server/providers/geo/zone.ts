import "server-only";
import { getEnv } from "@/server/config/env";
import { countryContext } from "@/server/locale";
import { getGeo, type GeoPoint } from "@/server/providers/geo";
import { takeGoogleCall } from "./budget";
import { coordinateBearingGeoUrl } from "./coordinate-url";

/** One answer per ~10 km cell: zones don't change at that scale, and repeat plans cost nothing. */
const cache = new Map<string, string | null>();

/**
 * The IANA time zone at a place (audit P05-001: abroad, plans used the phone's zone and briefed 10 PM in Lisbon as
 * daylight). From the reviewed country profile when the country has one zone; else Google's Time Zone API when a key is
 * configured (inside the shared Google budget); else null — the caller then says the zone isn't known, never guesses.
 */
export async function timeZoneFor(p: GeoPoint, now = new Date()): Promise<{ timeZone: string | null; source: "country" | "google" | null }> {
  const cell = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  if (cache.has(cell)) { const tz = cache.get(cell)!; return { timeZone: tz, source: tz ? "google" : null }; }
  try {
    const r = await getGeo().reverse(p);
    const single = r.country ? countryContext(r.country, r.region ?? null).timezone : null;
    if (single) return { timeZone: single, source: "country" };
  } catch { /* fall through to the zone lookup */ }
  const key = getEnv().GOOGLE_MAPS_SERVER_KEY;
  if (!key || !takeGoogleCall()) return { timeZone: null, source: null };
  try {
    const url = coordinateBearingGeoUrl("https://maps.googleapis.com", "/maps/api/timezone/json", { location: `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`, timestamp: String(Math.floor(now.getTime() / 1000)), key });
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    const body = (await res.json()) as { status?: string; timeZoneId?: string };
    const tz = body.status === "OK" && body.timeZoneId && validZone(body.timeZoneId) ? body.timeZoneId : null;
    cache.set(cell, tz);
    return { timeZone: tz, source: tz ? "google" : null };
  } catch {
    return { timeZone: null, source: null };
  }
}

function validZone(zone: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}
