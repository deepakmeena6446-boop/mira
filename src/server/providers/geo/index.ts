import "server-only";
import { getSql } from "@/server/db/client";
import { getEnv } from "@/server/config/env";
import { placeholderGeo } from "./placeholder";
import { googleGeo } from "./google";
import type { GeoProvider } from "./types";

export type { GeoPoint, GeoProvider, ModeRoute, PlaceHit, WalkRoute } from "./types";

/**
 * Maps provider factory: Google Maps Platform when a server key is set (with the
 * OpenStreetMap placeholder as automatic fallback on any failure), else the placeholder.
 */
export function getGeo(): GeoProvider {
  const fallback = placeholderGeo(getSql());
  const key = getEnv().GOOGLE_MAPS_SERVER_KEY;
  return key ? googleGeo(key, fallback) : fallback;
}
