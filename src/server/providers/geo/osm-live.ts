import "server-only";
import { classifyPlace, type PlaceType } from "@/domain/osm";
import { haversineMeters } from "@/domain/pilot";
import { getEnv } from "@/server/config/env";
import type { GeoPoint, PlaceHit } from "./types";

/**
 * Placeholder live OpenStreetMap lookups for places outside MIRA's local snapshot:
 * nearby places via Overpass, destination search via Photon. Same privacy rules as
 * osm-reverse.ts: called from our server (the user's IP never reaches them), positions
 * rounded to ~100 m, results cached, polite rate. Mapbox replaces both later.
 * Each is off unless its env URL is set (tests never touch the network).
 */

const UA = () => `MIRA/0.1 (placeholder geocoder; ${getEnv().APP_BASE_URL})`;
const round = (p: GeoPoint) => ({ lat: Number(p.lat.toFixed(3)), lon: Number(p.lon.toFixed(3)) });

function cached<T>(max: number, ttlMs: number) {
  const m = new Map<string, { at: number; v: T }>();
  return {
    get(k: string): T | undefined {
      const e = m.get(k);
      return e && Date.now() - e.at < ttlMs ? e.v : undefined;
    },
    set(k: string, v: T) {
      if (m.size >= max) m.delete(m.keys().next().value!);
      m.set(k, { at: Date.now(), v });
    },
  };
}

const nearbyCache = cached<PlaceHit[]>(500, 60 * 60_000);
let lastOverpass = 0;

/** Named places around a point, classified exactly like the local import. */
export async function overpassNearby(p: GeoPoint, radiusM: number, allowed: string[]): Promise<PlaceHit[]> {
  const base = getEnv().OVERPASS_URL;
  if (!base) return [];
  const c = round(p);
  const r = Math.min(Math.round(radiusM), 1500);
  const key = `${c.lat},${c.lon},${r}`;
  let hits = nearbyCache.get(key);
  if (!hits) {
    if (Date.now() - lastOverpass < 1000) return [];
    lastOverpass = Date.now();
    const around = `(around:${r},${c.lat},${c.lon})`;
    const query = `[out:json][timeout:8];(
      nwr${around}[name][amenity];
      nwr${around}[name][healthcare];
      nwr${around}[name][shop~"^(supermarket|convenience|mall|department_store)$"];
      nwr${around}[name][highway=bus_stop];
      nwr${around}[name][railway~"^(station|subway_entrance)$"];
    );out center tags 150;`;
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "user-agent": UA(), "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return [];
      type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
      const els = ((await res.json()) as { elements: El[] }).elements ?? [];
      hits = [];
      for (const e of els) {
        const at = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
        const cls = e.tags ? classifyPlace(e.tags) : null;
        if (!at || !cls || !e.tags?.name) continue;
        hits.push({
          id: `osm:${e.type}/${e.id}`,
          name: e.tags["name:en"] ?? e.tags.name,
          kind: cls.kindLabel,
          placeType: cls.placeType,
          lat: at.lat,
          lon: at.lon,
          hours: e.tags.opening_hours ?? null,
        } as PlaceHit & { placeType: PlaceType });
      }
      nearbyCache.set(key, hits);
    } catch {
      return [];
    }
  }
  return hits
    .filter((h) => allowed.includes((h as PlaceHit & { placeType: PlaceType }).placeType))
    .map((h) => {
      const { placeType, ...hit } = h as PlaceHit & { placeType?: PlaceType };
      void placeType; // internal only
      return { ...hit, distanceM: Math.round(haversineMeters(p, hit)) };
    })
    .filter((h) => h.distanceM! <= radiusM)
    .sort((a, b) => a.distanceM! - b.distanceM!)
    .slice(0, 30);
}

const searchCache = cached<PlaceHit[]>(500, 60 * 60_000);

/** Destination search biased to where the user is (Photon supports search-as-you-type). */
export async function photonSearch(q: string, near?: GeoPoint): Promise<PlaceHit[]> {
  const base = getEnv().PLACE_SEARCH_URL;
  if (!base) return [];
  const c = near ? round(near) : null;
  const key = `${q}|${c ? `${c.lat},${c.lon}` : ""}`;
  const hit = searchCache.get(key);
  if (hit) return hit;
  try {
    const url = new URL("/api/", base);
    url.search = new URLSearchParams({ q, limit: "8", lang: "en", ...(c ? { lat: String(c.lat), lon: String(c.lon) } : {}) }).toString();
    const res = await fetch(url, { headers: { "user-agent": UA() }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    type F = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
    const feats = ((await res.json()) as { features: F[] }).features ?? [];
    const out: PlaceHit[] = feats
      .filter((f) => f.properties.name)
      .map((f) => {
        const pr = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        const cls = classifyPlace({ [pr.osm_key ?? "place"]: pr.osm_value ?? "" });
        const where = [pr.district ?? pr.locality, pr.city].filter((x) => x && x !== pr.name).join(", ");
        return {
          id: `osm:${pr.osm_type ?? "x"}/${pr.osm_id ?? `${lat},${lon}`}`,
          name: pr.name!,
          kind: [cls?.kindLabel, where].filter(Boolean).join(" · ") || "Place",
          lat,
          lon,
          distanceM: near ? Math.round(haversineMeters(near, { lat, lon })) : undefined,
          hours: null,
        };
      });
    searchCache.set(key, out);
    return out;
  } catch {
    return [];
  }
}
