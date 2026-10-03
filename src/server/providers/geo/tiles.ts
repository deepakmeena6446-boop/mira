import "server-only";
import { getEnv } from "@/server/config/env";
import { errCode } from "@/server/log/err-code";

/**
 * Basemap config for the browser. With a Google Maps browser key: Google's 2D map tiles
 * (Map Tiles API) in our MapLibre map, a day and a night (dark) session. Otherwise the
 * OpenFreeMap vector styles (dark at night). Sessions are created server-side and reused
 * until shortly before they expire.
 */
export interface TileConfig {
  styleUrl: string | null;
  nightStyleUrl: string | null;
  url: string;
  nightUrl: string | null;
  attribution: string;
  provider: "google" | "openfreemap" | "raster";
}

// MIRA draws its own place pins, so Google's business icons would duplicate them; landmarks and transit stay.
const BASE_STYLES = [{ featureType: "poi.business", stylers: [{ visibility: "off" }] }];

// A calm night palette for Google's roadmap (Map Tiles API `styles`).
const NIGHT_STYLES = [
  ...BASE_STYLES,
  { stylers: [{ saturation: -30 }] },
  { elementType: "geometry", stylers: [{ color: "#1d1936" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#bdb6da" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#120f24" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2f2950" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3a3363" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#463e6e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0b1f" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f2a2a" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2a2257" }] },
];

type Session = { token: string; expiresAt: number };
const sessions = new Map<"day" | "night", Session>();

async function googleSession(key: string, kind: "day" | "night"): Promise<string | null> {
  const cached = sessions.get(kind);
  if (cached && cached.expiresAt - Date.now() > 24 * 3600_000) return cached.token;
  try {
    const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: "POST",
      // The browser key is restricted to our site's referrer (docs/DEPLOY.md); this call comes from the
      // server, so it must present that referrer or Google refuses it and every map silently falls back.
      headers: { "content-type": "application/json", referer: `${new URL(getEnv().APP_BASE_URL).origin}/` },
      // region: one shared session for everyone, so one border convention. IN is required for users in India.
      body: JSON.stringify({ mapType: "roadmap", language: "en-US", region: "IN", scale: "scaleFactor2x", highDpi: true, styles: kind === "night" ? NIGHT_STYLES : BASE_STYLES }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`tiles_${res.status}`);
    const data = (await res.json()) as { session: string; expiry: string };
    sessions.set(kind, { token: data.session, expiresAt: Number(data.expiry) * 1000 });
    return data.session;
  } catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "geo.google_tiles_failed", kind, error: errCode(err) }));
    return cached?.token ?? null;
  }
}

export async function tileConfig(): Promise<TileConfig> {
  const env = getEnv();
  const key = env.GOOGLE_MAPS_BROWSER_KEY;
  if (key) {
    const [day, night] = await Promise.all([googleSession(key, "day"), googleSession(key, "night")]);
    if (day) {
      const url = (s: string) => `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${s}&key=${encodeURIComponent(key)}`;
      // WorldMap obtains the complete, camera-specific copyright from the viewport endpoint.
      // A generic year/Google string cannot substitute for that required attribution.
      return { styleUrl: null, nightStyleUrl: null, url: url(day), nightUrl: night ? url(night) : null, attribution: "", provider: "google" };
    }
  }
  const styleUrl = env.MAP_STYLE_URL ?? null;
  const derivedNight = styleUrl && /^https:\/\/tiles\.openfreemap\.org\/styles\/[a-z]+$/.test(styleUrl) ? styleUrl.replace(/[a-z]+$/, "dark") : null;
  return {
    styleUrl,
    nightStyleUrl: env.MAP_STYLE_URL_NIGHT ?? derivedNight,
    url: env.MAP_TILE_URL,
    nightUrl: null,
    attribution: env.MAP_TILE_ATTRIBUTION ?? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    provider: styleUrl ? "openfreemap" : "raster",
  };
}
