import "server-only";
import { haversineMeters } from "@/domain/pilot";
import { FAR_M } from "@/domain/search-rank";
import { GoogleBudgetExceeded, takeGoogleCall } from "./budget";
import { getEnv } from "@/server/config/env";
import { scheduleFromGoogle } from "@/domain/opening-hours";
import { GOOGLE_HELP_TYPES, helpClassFromGoogle, type HelpClass, type HelpPoint } from "@/domain/help-points";
import type { GeoPoint, GeoProvider, HelpHours, PlaceHit, WalkRoute } from "./types";

/**
 * Google Maps Platform provider (Places API (New), Routes API, Geocoding API). Called only
 * from our server, so people's IP addresses never reach Google from these lookups, and
 * positions are rounded to what each task needs. Every call falls back to the placeholder
 * (OpenStreetMap) provider on any failure, so search and routes keep working.
 *
 * Field masks keep requests on the cheaper SKUs (no opening hours / ratings / photos). The
 * one exception is Help Point hours: a Place Details call per place, only for the few places
 * shown, only with GOOGLE_PLACES_HOURS=on, cached for up to 6 hours (helpHours).
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
    clear: () => m.clear(),
  };
}
const searchCache = cache<PlaceHit[]>(500, 10 * 60_000);
const nearbyCache = cache<PlaceHit[]>(500, 10 * 60_000);
const areaCache = cache<{ label: string | null; country: string | null; region: string | null }>(1000, 60 * 60_000);

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

/**
 * Google place types to ask for (src/domain/help-points.ts), in separate lookups for "near me"
 * so nearby pharmacies or shops can't crowd out a hospital, station or police station.
 */
const typesFor = (classes: readonly HelpClass[]) => Object.keys(GOOGLE_HELP_TYPES).filter((t) => classes.includes(GOOGLE_HELP_TYPES[t]));
const HELP_TYPE_GROUPS = {
  main: typesFor(["hospital", "police", "transit", "airport"]),
  late: typesFor(["hotel", "pharmacy", "fuel"]),
  convenience: typesFor(["convenience"]),
} as const;
const helpCache = cache<HelpPoint[]>(1000, 10 * 60_000);

type GHelpPlace = GPlace & { primaryType?: string };

/**
 * Help Point candidates around one (already rounded) point. Pro-SKU fields only (id, name,
 * location, primary type): no opening hours here. Hours come separately, and only for the few
 * places actually shown (helpHours below), so a lookup never pays the Enterprise SKU for 20+ places.
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
    HELP_NEARBY_FIELDS,
  )) as GHelpPlace[];
  const out: HelpPoint[] = [];
  for (const p of found) {
    const cls = helpClassFromGoogle(p.primaryType);
    if (!cls || !p.location || !p.displayName?.text) continue;
    out.push({ id: `g:${p.id}`, name: p.displayName.text, cls, lat: p.location.latitude, lon: p.location.longitude, open24h: false, hours: null, schedule: null, source: "google" });
  }
  helpCache.set(ck, out);
  return out;
}

/** Field masks, exported for tests: nearby discovery never asks for hours. */
export const HELP_NEARBY_FIELDS = "places.id,places.displayName,places.location,places.primaryType";
export const HELP_HOURS_FIELDS = "id,regularOpeningHours,currentOpeningHours.openNow";
/** At most this many Place Details (hours) calls per request. */
export const MAX_HOURS_LOOKUPS = 5;
/** Hours per place are kept in memory for at most 6 hours. */
const HOURS_TTL_MS = 6 * 60 * 60_000;
const HOURS_TIMEOUT_MS = 2500;
const hoursCache = cache<HelpHours>(2000, HOURS_TTL_MS);
const hoursInFlight = new Map<string, Promise<HelpHours>>();

type GPeriod = { open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } };

/** Place Details (New) for one place, hours fields only (Enterprise SKU; counted against the budget). */
async function placeHours(key: string, placeId: string): Promise<HelpHours> {
  if (!takeGoogleCall()) throw new GoogleBudgetExceeded();
  const res = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}?languageCode=en`, {
    headers: { "x-goog-api-key": key, "x-goog-fieldmask": HELP_HOURS_FIELDS },
    signal: AbortSignal.timeout(HOURS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`details_${res.status}`);
  const d = (await res.json()) as { regularOpeningHours?: { periods?: GPeriod[]; weekdayDescriptions?: string[] }; currentOpeningHours?: { openNow?: boolean } };
  const schedule = scheduleFromGoogle(d.regularOpeningHours?.periods);
  const openNow = d.currentOpeningHours?.openNow;
  return {
    schedule,
    text: schedule && schedule !== "24/7" ? (d.regularOpeningHours?.weekdayDescriptions?.join("; ").slice(0, 400) ?? null) : null,
    ...(typeof openNow === "boolean" ? { openNow, checkedAt: Date.now() } : {}),
  };
}

/** Test hook: forget cached Help Point lookups and hours. */
export function resetGoogleHelpCaches() {
  helpCache.clear();
  hoursCache.clear();
  hoursInFlight.clear();
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
      if (cached !== undefined) return { ...cached, precise: false };
      try {
        if (!takeGoogleCall()) throw new GoogleBudgetExceeded();
        const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        url.search = new URLSearchParams({ latlng: `${r.lat},${r.lon}`, language: "en", key }).toString();
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const data = (await res.json()) as { status: string; results: Array<{ address_components: Array<{ long_name: string; short_name?: string; types: string[] }> }> };
        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`geocode_${data.status}`);
        const comps = data.results.flatMap((x) => x.address_components);
        const pick = (t: string) => comps.find((c) => c.types.includes(t))?.long_name;
        const label = pick("neighborhood") ?? pick("sublocality_level_2") ?? pick("sublocality_level_1") ?? pick("sublocality") ?? pick("locality") ?? null;
        const short = (t: string) => comps.find((c) => c.types.includes(t))?.short_name;
        const country = short("country")?.toUpperCase().slice(0, 2) ?? null;
        const state = short("administrative_area_level_1");
        const region = country && state && /^[A-Z0-9]{1,3}$/.test(state) ? `${country}-${state}` : null;
        areaCache.set(ck, { label, country, region });
        return { label, precise: false, country, region };
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

    async helpPlaces(points, radiusM, opts) {
      if (!points.length) return [];
      const r = Math.min(Math.max(radiusM, 300), 5000);
      // One point ("near me"): separate lookups so pharmacies (or convenience stores) can't crowd
      // out a hospital, station or police station. Along a route: one lookup per sample point.
      const groups =
        points.length === 1
          ? [HELP_TYPE_GROUPS.main, HELP_TYPE_GROUPS.late, ...(opts?.convenience ? [HELP_TYPE_GROUPS.convenience] : [])]
          : [[...HELP_TYPE_GROUPS.main, ...HELP_TYPE_GROUPS.late]];
      try {
        const found = await Promise.all(points.flatMap((p) => groups.map((types) => helpNearby(key, round(p, 3), r, types))));
        return found.flat();
      } catch (err) {
        warn("help_places", err);
        return fallback.helpPlaces(points, radiusM, opts);
      }
    },

    /**
     * Listed hours (and Google's own "open now", which counts special hours) for at most
     * MAX_HOURS_LOOKUPS Google places. Off unless GOOGLE_PLACES_HOURS=on. Each call is a
     * Place Details (Enterprise SKU) request counted against the Google budget; results are
     * cached per place for ≤ 6 h. A failed or over-budget lookup just means "hours not known".
     */
    async helpHours(ids) {
      const out = new Map<string, HelpHours>();
      if (getEnv().GOOGLE_PLACES_HOURS !== "on") return out;
      const wanted = [...new Set(ids.filter((id) => id.startsWith("g:")))].slice(0, MAX_HOURS_LOOKUPS);
      await Promise.all(
        wanted.map(async (id) => {
          const cached = hoursCache.get(id);
          if (cached) {
            out.set(id, cached);
            return;
          }
          let pending = hoursInFlight.get(id);
          if (!pending) {
            pending = placeHours(key, id.slice(2));
            hoursInFlight.set(id, pending);
          }
          try {
            const h = await pending;
            hoursCache.set(id, h);
            out.set(id, h);
          } catch (err) {
            if (!(err instanceof GoogleBudgetExceeded)) warn("help_hours", err);
          } finally {
            hoursInFlight.delete(id);
          }
        }),
      );
      return out;
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
