import "server-only";
import { getEnv } from "@/server/config/env";

/**
 * Basemap config for the browser (placeholder: OpenFreeMap; later Mapbox). The night
 * style is used after dark (see src/domain/daypart.ts); by default it's the matching
 * OpenFreeMap "dark" style when the day style is an OpenFreeMap one.
 */
export function tileConfig() {
  const env = getEnv();
  const styleUrl = env.MAP_STYLE_URL ?? null;
  const derivedNight = styleUrl && /^https:\/\/tiles\.openfreemap\.org\/styles\/[a-z]+$/.test(styleUrl) ? styleUrl.replace(/[a-z]+$/, "dark") : null;
  return {
    styleUrl,
    nightStyleUrl: env.MAP_STYLE_URL_NIGHT ?? derivedNight,
    url: env.MAP_TILE_URL,
    attribution: env.MAP_TILE_ATTRIBUTION ?? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  };
}

export type TileConfig = ReturnType<typeof tileConfig>;
