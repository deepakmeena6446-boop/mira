import "server-only";
import { getSql } from "@/server/db/client";
import { placeholderGeo } from "./placeholder";
import type { GeoProvider } from "./types";

export type { GeoPoint, GeoProvider, PlaceHit, WalkRoute } from "./types";

/** Maps provider factory. A Mapbox adapter plugs in here when implemented. */
export function getGeo(): GeoProvider {
  return placeholderGeo(getSql());
}
