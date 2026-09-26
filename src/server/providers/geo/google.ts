import "server-only";
import { haversineMeters } from "@/domain/pilot";
import { FAR_M } from "@/domain/search-rank";
import { GoogleBudgetExceeded, takeGoogleCall } from "./budget";
import { GOOGLE_HELP_TYPES, HELP_CLASSES, helpClassFromGoogle, type HelpPoint } from "@/domain/help-points";
import type { GeoPoint, GeoProvider, PlaceHit, WalkRoute } from "./types";

/**
 * Google Maps Platform provider (Places API (New), Routes API, Geocoding API). Called only
 * from our server, so people's IP addresses never reach Google from these lookups, and
 * positions are rounded to what each task needs. Every call falls back to the placeholder
 * (OpenStreetMap) provider on any failure, so search and routes keep working.
 *
 * Field masks keep requests on the cheaper SKUs (no opening hours / ratings / photos).
 */

const PLACES = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 5000;

/** MIRA's place kinds → Google place types (Places API (New) Table A). */
const KIND_TYPES: Record<string, string[]> = {
  pharmacy: ["pharmacy", "drugstore"],
  health: ["hospital", "doctor", "medical_lab"],
  police: ["police"],
  metro: ["subway_station", "train_station", "light_rail_station"],
  bus: ["bus_station", "bus_stop", "transit_station"],
  food: ["restaurant", "cafe", "bakery", "fast_food_restaurant", "coffee_shop"],
  shop: ["convenience_store", "supermarket", "grocery_store", "shopping_mall"],
  toilets: ["public_bathroom"],
  finance: ["atm", "bank"],
};
const ALL_KINDS = Object.keys(KIND_TYPES);

type GPlace = {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text: string };
  shortFormattedAddress?: string;
};

const round = (p: GeoPoint, dp: number) => ({ lat: Number(p.lat.toFixed(dp)), lon: Number(p.lon.toFixed(dp)) });

function cache<T>(max: number, ttlMs: number) {
  const m = new Map<string, { at: number; v: T }>();
  return {
    get: (k: string) => {
      const e = m.get(k);
      return e && Date.now() - e.at < ttlMs ? e.v : undefined;
    },
    set: (k: string, v: T) => {
      if (m.size >= max) m.delete(m.keys().next().value!);
      m.set(k, { at: Date.now(), v });
    },
  };
}
const searchCache = cache<PlaceHit[]>(500, 10 * 60_000);
const nearbyCache = cache<PlaceHit[]>(500, 10 * 60_000);
const areaCache = cache<string | null>(1000, 60 * 60_000);

async function places(key: string, method: "searchText" | "searchNearby", body: unknown, fields: string): Promise<GPlace[]> {
  if (!takeGoogleCall()) throw new GoogleBudgetExceeded();
  const res = await fetch(`${PLACES}/places:${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": fields },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`places_${res.status}`);
  return ((await res.json()) as { places?: GPlace[] }).places ?? [];
}

function toHit(p: GPlace, near?: GeoPoint): PlaceHit | null {
  if (!p.location || !p.displayName?.text) return null;
  const at = { lat: p.location.latitude, lon: p.location.longitude };
  const area = p.shortFormattedAddress?.split(",").slice(-2).join(",").trim();
  return {
    id: `g:${p.id}`,
    name: p.displayName.text,
    kind: [p.primaryTypeDisplayName?.text, area].filter(Boolean).join(" · ") || "Place",
    ...at,
    distanceM: near ? Math.round(haversineMeters(near, at)) : undefined,
    hours: null,
  };
}

/** Google's encoded polyline → [lon, lat] pairs. */
export function decodePolyline(encoded: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < encoded.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lon += delta;
    }
    out.push([lon / 1e5, lat / 1e5]);
  }
  return out;
}

type GRoute = { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } };

/** Walking routes from the Routes API; with `alternatives`, Google's alternates too (fastest first). */
async function computeWalks(key: string, a: GeoPoint, b: GeoPoint, alternatives: boolean): Promise<WalkRoute[]> {
  if (!takeGoogleCall()) throw new GoogleBudgetExceeded();
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lon } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lon } } },
      travelMode: "WALK",
      computeAlternativeRoutes: alternatives,
      languageCode: "en",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`routes_${res.status}`);
  const routes = (((await res.json()) as { routes?: GRoute[] }).routes ?? [])
    .filter((r) => r.polyline?.encodedPolyline)
    .map((r) => ({
      meters: r.distanceMeters ?? 0,
      minutes: Math.max(1, Math.round(Number((r.duration ?? "0s").replace("s", "")) / 60)),
      geometry: decodePolyline(r.polyline!.encodedPolyline!),
      approximate: false,
    }));
  if (!routes.length) throw new Error("routes_none");
  return routes.sort((x, y) => x.minutes - y.minutes).slice(0, 3);
}

/** Google place types to ask for, by Help Point tier (src/domain/help-points.ts). */
const HELP_TIER_TYPES = {
  1: Object.keys(GOOGLE_HELP_TYPES).filter((t) => HELP_CLASSES[GOOGLE_HELP_TYPES[t]].tier === 1),
  2: Object.keys(GOOGLE_HELP_TYPES).filter((t) => HELP_CLASSES[GOOGLE_HELP_TYPES[t]].tier === 2),
} as const;
const helpCache = cache<HelpPoint[]>(1000, 10 * 60_000);

type GHelpPlace = GPlace & { primaryType?: string };

/**
 * Help Point candidates around one (already rounded) point. Same Pro-SKU fields as the
 * nearby list plus the machine place types; opening hours aren't requested (a pricier SKU),
 * so every Google Help Point honestly says "hours not known".
 */
async function helpNearby(key: string, c: GeoPoint, radiusM: number, types: readonly string[]): Promise<HelpPoint[]> {
  const ck = `${c.lat},${c.lon}|${Math.round(radiusM)}|${types.join(",")}`;
  const hit = helpCache.get(ck);
  if (hit) return hit;
  const found = (await places(
    key,
    "searchNearby",
    // includedPrimaryTypes: a doctor whose secondary types include "hospital" is not returned.
    { includedPrimaryTypes: types, maxResultCount: 20, rankPreference: "DISTANCE", languageCode: "en", locationRestriction: { circle: { center: { latitude: c.lat, longitude: c.lon }, radius: radiusM } } },
    "places.id,places.displayName,places.location,places.primaryType",
  )) as GHelpPlace[];
  const out: HelpPoint[] = [];
  for (const p of found) {
    const cls = helpClassFromGoogle(p.primaryType);
    if (!cls || !p.location || !p.displayName?.text) continue;
    out.push({ id: `g:${p.id}`, name: p.displayName.text, cls, lat: p.location.latitude, lon: p.location.longitude, open24h: false, hours: null, source: "google" });
  }
  helpCache.set(ck, out);
  return out;
}

const warn = (op: string, err: unknown) =>
  console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "geo.google_failed", op, error: err instanceof Error ? err.message.slice(0, 40) : "unknown" }));

export function googleGeo(key: string, fallback: GeoProvider): GeoProvider {
  return {
    async search(q, near, opts) {
      const text = q.trim().slice(0, 80);
      if (text.length < 2) return [];
      const bias = near ? round(near, 2) : null; // ~1 km is plenty to bias results
      const ck = `${text.toLowerCase()}|${bias ? `${bias.lat},${bias.lon}` : ""}`;
      const hit = searchCache.get(ck);
      if (hit) return hit;
      try {
        const found = await places(
          key,
          "searchText",
          { textQuery: text, pageSize: 8, languageCode: "en", ...(bias ? { locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lon }, radius: 30_000 } } } : {}) },
          "places.id,places.displayName,places.location,places.primaryTypeDisplayName,places.shortFormattedAddress",
        );
        const hits = found.map((p) => toHit(p, near)).filter((h): h is PlaceHit => h !== null);
        // Keep Google's relevance order; just drop same-name places in other cities when there are local ones.
        const local = near ? hits.filter((h) => (h.distanceM ?? 0) <= FAR_M) : hits;
        const out = local.length ? local : hits;
        searchCache.set(ck, out);
        return out;
      } catch (err) {
        warn("search", err);
        return fallback.search(q, near, opts);
      }
    },

    async reverse(p) {
      const r = round(p, 3); // ~100 m: enough for a neighbourhood name
      const ck = `${r.lat},${r.lon}`;
      const cached = areaCache.get(ck);
      if (cached !== undefined) return { label: cached, precise: false };
      try {
        if (!takeGoogleCall()) throw new GoogleBudgetExceeded();
        const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        url.search = new URLSearchParams({ latlng: `${r.lat},${r.lon}`, language: "en", key }).toString();
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const data = (await res.json()) as { status: string; results: Array<{ address_components: Array<{ long_name: string; types: string[] }> }> };
        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`geocode_${data.status}`);
        const comps = data.results.flatMap((x) => x.address_components);
        const pick = (t: string) => comps.find((c) => c.types.includes(t))?.long_name;
        const label = pick("neighborhood") ?? pick("sublocality_level_2") ?? pick("sublocality_level_1") ?? pick("sublocality") ?? pick("locality") ?? null;
        areaCache.set(ck, label);
        return { label, precise: false };
      } catch (err) {
        warn("reverse", err);
        return fallback.reverse(p);
      }
    },

    async walk(a, b): Promise<WalkRoute> {
      try {
        return (await computeWalks(key, a, b, false))[0];
      } catch (err) {
        warn("walk", err);
        return fallback.walk(a, b);
      }
    },

    async walkRoutes(a, b): Promise<WalkRoute[]> {
      try {
        return await computeWalks(key, a, b, true);
      } catch (err) {
        warn("walk_routes", err);
        return fallback.walkRoutes(a, b);
      }
    },

    async helpPlaces(points, radiusM) {
      if (!points.length) return [];
      const r = Math.min(Math.max(radiusM, 300), 5000);
      // One point ("near me"): ask for each tier separately so nearby pharmacies can't crowd
      // out the hospital or police station. Along a route: one lookup per sample point.
      const groups = points.length === 1 ? [HELP_TIER_TYPES[1], HELP_TIER_TYPES[2]] : [[...HELP_TIER_TYPES[1], ...HELP_TIER_TYPES[2]]];
      try {
        const found = await Promise.all(points.flatMap((p) => groups.map((types) => helpNearby(key, round(p, 3), r, types))));
        return found.flat();
      } catch (err) {
        warn("help_places", err);
        return fallback.helpPlaces(points, radiusM);
      }
    },

    async nearby(p, radiusM, kinds) {
      const wanted = kinds?.length ? kinds.filter((k) => KIND_TYPES[k]) : ALL_KINDS;
      const types = [...new Set(wanted.flatMap((k) => KIND_TYPES[k]))];
      if (!types.length) return [];
      const c = round(p, 3); // ~100 m
      const ck = `${c.lat},${c.lon}|${Math.round(radiusM)}|${types.join(",")}`;
      const hit = nearbyCache.get(ck);
      if (hit) return hit.map((h) => ({ ...h, distanceM: Math.round(haversineMeters(p, h)) }));
      try {
        const found = await places(
          key,
          "searchNearby",
          { includedTypes: types, maxResultCount: 15, rankPreference: "DISTANCE", languageCode: "en", locationRestriction: { circle: { center: { latitude: c.lat, longitude: c.lon }, radius: Math.min(Math.max(radiusM, 300), 5000) } } },
          "places.id,places.displayName,places.location,places.primaryTypeDisplayName",
        );
        const hits = found.map((x) => toHit(x, p)).filter((h): h is PlaceHit => h !== null);
        nearbyCache.set(ck, hits);
        return hits;
      } catch (err) {
        warn("nearby", err);
        return fallback.nearby(p, radiusM, kinds);
      }
    },
  };
}
