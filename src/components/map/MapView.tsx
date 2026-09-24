"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";

export interface MapMarker {
  lat: number;
  lon: number;
  role: "place" | "origin" | "destination";
}
export interface MapRoute {
  id: string;
  geometry: Array<[number, number]>;
  variant: "primary" | "secondary";
}

export type MapStatus = "loading" | "ready" | "failed";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function markersFc(markers: MapMarker[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((m) => ({ type: "Feature", properties: { role: m.role }, geometry: { type: "Point", coordinates: [m.lon, m.lat] } })),
  };
}
function routesFc(routes: MapRoute[], selected: string | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      properties: { id: r.id, variant: r.variant, selected: selected === null || selected === r.id },
      geometry: { type: "LineString", coordinates: r.geometry },
    })),
  };
}

/**
 * MapLibre raster map with route lines and markers. Visual only: every fact shown
 * here is also in the text list, so a tile or WebGL failure never hides evidence.
 * Tiles are fetched normally (no prefetching or offline downloads).
 */
export function MapView({
  tiles,
  bounds,
  markers,
  routes = [],
  selectedRoute = null,
  label,
  onStatus,
  className,
}: {
  tiles: { url: string; attribution: string };
  bounds: { south: number; north: number; west: number; east: number };
  markers: MapMarker[];
  routes?: MapRoute[];
  selectedRoute?: string | null;
  label: string;
  onStatus?: (s: MapStatus) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [created, setCreated] = useState(false);
  const statusRef = useRef(onStatus);
  useEffect(() => {
    statusRef.current = onStatus;
  }, [onStatus]);

  const report = (s: MapStatus) => {
    setStatus(s);
    statusRef.current?.(s);
  };

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let tileLoaded = false;
    let tileErrors = 0;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeObserver: ResizeObserver | undefined;
    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {
              base: { type: "raster", tiles: [tiles.url], tileSize: 256, maxzoom: 19, attribution: tiles.attribution },
              routes: { type: "geojson", data: EMPTY },
              markers: { type: "geojson", data: EMPTY },
            },
            layers: [
              { id: "base", type: "raster", source: "base" },
              {
                id: "route-casing",
                type: "line",
                source: "routes",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": ["case", ["get", "selected"], 0.95, 0.5] },
              },
              {
                id: "route-secondary",
                type: "line",
                source: "routes",
                filter: ["==", ["get", "variant"], "secondary"],
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": "#3a3f4b", "line-width": 5, "line-dasharray": [1.5, 1.2], "line-opacity": ["case", ["get", "selected"], 1, 0.45] },
              },
              {
                id: "route-primary",
                type: "line",
                source: "routes",
                filter: ["==", ["get", "variant"], "primary"],
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": "#3b35a8", "line-width": 5, "line-opacity": ["case", ["get", "selected"], 1, 0.45] },
              },
              {
                id: "markers",
                type: "circle",
                source: "markers",
                paint: {
                  "circle-radius": ["match", ["get", "role"], "origin", 7, 9],
                  "circle-color": ["match", ["get", "role"], "origin", "#ffffff", "#3b35a8"],
                  "circle-stroke-color": ["match", ["get", "role"], "origin", "#3b35a8", "#ffffff"],
                  "circle-stroke-width": 3,
                },
              },
            ],
          },
          bounds: [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          maxBounds: [
            [bounds.west - 0.02, bounds.south - 0.02],
            [bounds.east + 0.02, bounds.north + 0.02],
          ],
          minZoom: 13,
          maxZoom: 19,
          attributionControl: { compact: false },
          cooperativeGestures: false,
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;
        setCreated(true);
        // Keep the canvas in sync with layout changes (initial layout, sheet snap points, rotation).
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(containerRef.current);

        map.on("sourcedata", (e) => {
          if (e.sourceId === "base" && e.tile && !tileLoaded) {
            tileLoaded = true;
            if (failTimer) clearTimeout(failTimer);
            report("ready");
          }
        });
        map.on("error", (e) => {
          const src = (e as unknown as { sourceId?: string }).sourceId;
          if (src === "base" || (e as unknown as { tile?: unknown }).tile) {
            tileErrors += 1;
            if (!tileLoaded && tileErrors >= 2) report("failed");
          }
        });
        // If no tile arrives within 15 s of *visible* time, treat the map as failed and keep
        // the text view. Hidden tabs pause rendering, so they don't count toward the timeout.
        const armFailTimer = () => {
          failTimer = setTimeout(() => {
            if (tileLoaded || cancelled) return;
            if (document.visibilityState === "hidden") armFailTimer();
            else report("failed");
          }, 15_000);
        };
        armFailTimer();
      } catch {
        report("failed");
      }
    })();
    return () => {
      cancelled = true;
      if (failTimer) clearTimeout(failTimer);
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The base map is created once per tile configuration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.url]);

  // Update overlays whenever data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("markers") as GeoJSONSource | undefined)?.setData(markersFc(markers));
      (map.getSource("routes") as GeoJSONSource | undefined)?.setData(routesFc(routes, selectedRoute));
      const pts: Array<[number, number]> = [...markers.map((m) => [m.lon, m.lat] as [number, number]), ...routes.flatMap((r) => r.geometry)];
      if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 16.5 });
      else if (pts.length > 1) {
        const lons = pts.map((p) => p[0]);
        const lats = pts.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 48, maxZoom: 17.5, duration: 0 },
        );
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [markers, routes, selectedRoute, created]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={containerRef} role="img" aria-label={label} className="h-full w-full overflow-hidden rounded-[var(--radius-card)] bg-sunken" />
      {status === "loading" ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center rounded-[var(--radius-card)] text-sm text-ink-muted">
          Loading map…
        </div>
      ) : null}
    </div>
  );
}
