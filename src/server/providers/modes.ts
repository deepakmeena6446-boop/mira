import "server-only";

/**
 * Which implementation each external capability uses. Everything runs on a working
 * placeholder until a real adapter exists AND its credentials are configured, so the
 * UI never claims a live integration that isn't wired. Real adapters plug in at each
 * provider's `get*()` factory and flip the matching flag below.
 */
const REAL_ADAPTERS = { mapbox: false, googleMaps: true, google: true, claude: true, webPush: true } as const;

export interface ProviderModes {
  maps: "placeholder" | "google" | "mapbox";
  auth: "demo" | "google";
  companion: "placeholder" | "claude";
  push: "in_app" | "web_push";
}

export function providerModes(): ProviderModes {
  const env = process.env;
  return {
    maps: REAL_ADAPTERS.googleMaps && env.GOOGLE_MAPS_SERVER_KEY ? "google" : REAL_ADAPTERS.mapbox && env.MAPBOX_TOKEN ? "mapbox" : "placeholder",
    auth: REAL_ADAPTERS.google && env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET ? "google" : "demo",
    companion: REAL_ADAPTERS.claude && env.ANTHROPIC_API_KEY ? "claude" : "placeholder",
    push: REAL_ADAPTERS.webPush && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? "web_push" : "in_app",
  };
}

export function isDemo(m: ProviderModes = providerModes()): boolean {
  return m.maps === "placeholder" || m.auth === "demo" || m.companion === "placeholder";
}
