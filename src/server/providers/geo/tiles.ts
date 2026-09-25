import "server-only";
import { getEnv } from "@/server/config/env";

/** Basemap tile config for the browser (placeholder: CARTO Voyager; later Mapbox). */
export function tileConfig() {
  const env = getEnv();
  return {
    styleUrl: env.MAP_STYLE_URL ?? null,
    url: env.MAP_TILE_URL,
    attribution: env.MAP_TILE_ATTRIBUTION ?? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  };
}
