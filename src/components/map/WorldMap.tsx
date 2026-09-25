"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";

export interface LngLat {
  lat: number;
  lon: number;
}
export interface MapNote {
  id: string;
  lat: number;
  lon: number;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const pt = (p: LngLat, props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [p.lon, p.lat] } });

/**
 * Full-screen world map for the home and trip screens. Everything shown here is also
 * available as text in the sheet, so a tile or WebGL failure never hides information.
 */
export function WorldMap({
  tiles,
  me,
  dest,
  route,
  notes = [],
  follow = true,
  onMapClick,
  onReady,
  padding = { top: 140, bottom: 320, left: 40, right: 40 },
  className,
  label,
}: {
  tiles: { url: string; attribution: string; styleUrl?: string | null };
  me: LngLat | null;
  dest?: LngLat | null;
  route?: Array<[number, number]> | null;
  notes?: MapNote[];
  follow?: boolean;
  onMapClick?: (p: LngLat) => void;
  onReady?: (ok: boolean) => void;
  padding?: { top: number; bottom: number; left: number; right: number };
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const clickRef = useRef(onMapClick);
  const readyRef = useRef(onReady);
  useEffect(() => {
    clickRef.current = onMapClick;
    readyRef.current = onReady;
  }, [onMapClick, onReady]);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !ref.current) return;
        ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const map = new ml.Map({
          container: ref.current,
          style: tiles.styleUrl ?? {
            version: 8,
            sources: { base: { type: "raster", tiles: [tiles.url], tileSize: 256, maxzoom: 20, attribution: tiles.attribution } },
            layers: [{ id: "base", type: "raster", source: "base" }],
          },
          center: me ? [me.lon, me.lat] : [77.209, 28.6139],
          zoom: me ? 15 : 11,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        map.on("click", (e: MapMouseEvent) => clickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
        let loaded = false;
        map.on("error", () => !loaded && readyRef.current?.(false));
        ro = new ResizeObserver(() => map.resize());
        ro.observe(ref.current);
        mapRef.current = map;
        map.once("load", () => {
          if (cancelled) return;
          loaded = true;
          // App overlays sit on top of whichever basemap style is in use.
          map.addSource("route", { type: "geojson", data: EMPTY });
          map.addSource("points", { type: "geojson", data: EMPTY });
          map.addSource("notes", { type: "geojson", data: EMPTY });
          map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#a78bfa", "line-width": 12, "line-opacity": 0.35 } });
          map.addLayer({ id: "route", type: "line", source: "route", filter: ["!", ["get", "approx"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#6a44f5", "line-width": 5 } });
          map.addLayer({ id: "route-approx", type: "line", source: "route", filter: ["get", "approx"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#6a44f5", "line-width": 5, "line-dasharray": [1.2, 1.6] } });
          map.addLayer({ id: "notes", type: "circle", source: "notes", paint: { "circle-radius": 11, "circle-color": "#ff8a65", "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
          map.addLayer({ id: "me-halo", type: "circle", source: "points", filter: ["==", ["get", "kind"], "me"], paint: { "circle-radius": 22, "circle-color": "#3b82f6", "circle-opacity": 0.18 } });
          map.addLayer({ id: "me", type: "circle", source: "points", filter: ["==", ["get", "kind"], "me"], paint: { "circle-radius": 8, "circle-color": "#2563eb", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
          map.addLayer({ id: "dest", type: "circle", source: "points", filter: ["==", ["get", "kind"], "dest"], paint: { "circle-radius": 11, "circle-color": "#6a44f5", "circle-stroke-color": "#fff", "circle-stroke-width": 4 } });
          readyRef.current?.(true);
          setReady(true);
        });
      } catch {
        readyRef.current?.(false);
      }
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.url, tiles.styleUrl]);

  // Data layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const feats: GeoJSON.Feature[] = [];
    if (me) feats.push(pt(me, { kind: "me" }));
    if (dest) feats.push(pt(dest, { kind: "dest" }));
    (map.getSource("points") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    (map.getSource("notes") as GeoJSONSource).setData({ type: "FeatureCollection", features: notes.map((n) => pt(n, { id: n.id })) });
    (map.getSource("route") as GeoJSONSource).setData(
      route && route.length > 1
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { approx: route.length === 2 }, geometry: { type: "LineString", coordinates: route } }] }
        : EMPTY,
    );
  }, [me, dest, route, notes, ready]);

  // Camera: fit the route or follow the user.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const coords: Array<[number, number]> = route && route.length > 1 ? route : dest && me ? [[me.lon, me.lat], [dest.lon, dest.lat]] : [];
    if (coords.length > 1) {
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding, maxZoom: 17, duration: 700 });
    } else if (dest) {
      map.easeTo({ center: [dest.lon, dest.lat], zoom: 16, duration: 700, padding });
    } else if (me && follow) {
      map.easeTo({ center: [me.lon, me.lat], zoom: Math.max(map.getZoom(), 15), duration: 700, padding });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lon, dest?.lat, dest?.lon, route, ready, follow]);

  return (
    <div className={className ?? "absolute inset-0"}>
      <div ref={ref} role="img" aria-label={label} className="h-full w-full bg-sunken" />
    </div>
  );
}
