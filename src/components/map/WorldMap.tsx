"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource, MapMouseEvent, Marker } from "maplibre-gl";

export interface LngLat {
  lat: number;
  lon: number;
}
export interface MapPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  emoji: string;
}
export interface MapNote {
  id: string;
  lat: number;
  lon: number;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const pt = (p: LngLat, props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [p.lon, p.lat] } });

const LABELLED_PINS = 5;
const MAX_LABELS = 6;

/** Show pin names closest-first, skipping any that would overlap a shown name or another pin. */
function declutter(map: MlMap, markers: Map<string, Marker>) {
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const items = [...markers.values()]
    .map((m) => ({ label: m.getElement().querySelector<HTMLElement>(".mira-pin-label"), pt: map.project(m.getLngLat()) }))
    .filter((x): x is typeof x & { label: HTMLElement } => Boolean(x.label))
    .sort((a, b) => Number(a.label.dataset.rank) - Number(b.label.dataset.rank));
  const dots: Box[] = items.map(({ pt }) => ({ x0: pt.x - 16, x1: pt.x + 16, y0: pt.y - 16, y1: pt.y + 16 }));
  const shown: Box[] = [];
  items.forEach(({ label, pt }, i) => {
    const w = Math.min(120, label.textContent!.length * 6.2 + 14);
    const box = { x0: pt.x - w / 2 - 3, x1: pt.x + w / 2 + 3, y0: pt.y + 14, y1: pt.y + 34 }; // name sits under the dot
    const visible = shown.length < MAX_LABELS && !shown.some((b) => hit(box, b)) && !dots.some((d, j) => j !== i && hit(box, d));
    label.style.display = visible ? "" : "none";
    if (visible) shown.push(box);
  });
}

// Smaller places first: "Kamla Nagar" is more useful than "Delhi".
const LOCALITY_RANK: Record<string, number> = { neighbourhood: 0, quarter: 0, suburb: 1, hamlet: 1, village: 2, town: 3, city: 4 };
const LOCALITY_REACH_M: Record<string, number> = { neighbourhood: 1500, quarter: 1500, suburb: 3000, hamlet: 3000, village: 5000, town: 12000, city: 30000 };

/** Nearest named locality in the vector basemap (OpenMapTiles `place` layer); null on raster or no data. */
function localityNear(map: MlMap, p: LngLat): string | null {
  const source = Object.entries(map.getStyle()?.sources ?? {}).find(([, s]) => s.type === "vector")?.[0];
  if (!source) return null;
  let best: { name: string; score: number } | null = null;
  for (const f of map.querySourceFeatures(source, { sourceLayer: "place" })) {
    const cls = String(f.properties?.class ?? "");
    const name = (f.properties?.["name:en"] ?? f.properties?.name_en ?? f.properties?.name) as string | undefined;
    if (!(cls in LOCALITY_RANK) || !name || f.geometry.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates;
    const d = Math.hypot((lon - p.lon) * Math.cos((p.lat * Math.PI) / 180), lat - p.lat) * 111_320;
    if (d > LOCALITY_REACH_M[cls]) continue;
    const score = LOCALITY_RANK[cls] * 10_000 + d;
    if (!best || score < best.score) best = { name, score };
  }
  return best?.name ?? null;
}

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
  places = [],
  onPlaceClick,
  follow = true,
  onMapClick,
  onReady,
  onArea,
  padding = { top: 140, bottom: 320, left: 40, right: 40 },
  className,
  label,
}: {
  tiles: { url: string; attribution: string; styleUrl?: string | null };
  me: LngLat | null;
  dest?: LngLat | null;
  route?: Array<[number, number]> | null;
  notes?: MapNote[];
  /** Nearby places as tappable pins; the first few (closest) also show their name. */
  places?: MapPlace[];
  onPlaceClick?: (p: MapPlace) => void;
  follow?: boolean;
  onMapClick?: (p: LngLat) => void;
  onReady?: (ok: boolean) => void;
  /** Nearest locality name from the already-downloaded vector tiles (no extra lookup service). */
  onArea?: (name: string | null) => void;
  padding?: { top: number; bottom: number; left: number; right: number };
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const clickRef = useRef(onMapClick);
  const readyRef = useRef(onReady);
  const areaRef = useRef(onArea);
  const placeClickRef = useRef(onPlaceClick);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  useEffect(() => {
    clickRef.current = onMapClick;
    readyRef.current = onReady;
    areaRef.current = onArea;
    placeClickRef.current = onPlaceClick;
  }, [onMapClick, onReady, onArea, onPlaceClick]);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !ref.current) return;
        mlRef.current = ml;
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
        map.on("moveend", () => declutter(map, markersRef.current));
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
    const markers = markersRef.current;
    return () => {
      cancelled = true;
      ro?.disconnect();
      markers.forEach((m) => m.remove());
      markers.clear();
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

  // Place pins (HTML markers: crisp emoji, keyboard-focusable, work on any basemap).
  const placesKey = places.map((p) => p.id).join("|");
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !ready) return;
    const markers = markersRef.current;
    const want = new Set(places.map((p) => p.id));
    for (const [id, m] of markers) {
      if (want.has(id)) continue;
      m.remove();
      markers.delete(id);
    }
    places.forEach((p, i) => {
      markers.get(p.id)?.getElement().querySelector<HTMLElement>(".mira-pin-label")?.setAttribute("data-rank", String(i));
      if (markers.has(p.id)) return;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mira-pin";
      el.setAttribute("aria-label", `${p.name} — show route`);
      el.title = p.name;
      const dot = document.createElement("span");
      dot.className = "mira-pin-dot";
      dot.textContent = p.emoji;
      el.append(dot);
      const label = document.createElement("span");
      label.className = "mira-pin-label";
      label.textContent = p.name;
      label.dataset.rank = String(i);
      el.append(label);
      // Keep the tap on the pin from also counting as a map tap (e.g. in drop-a-pin mode).
      for (const ev of ["mousedown", "touchstart", "pointerdown"]) el.addEventListener(ev, (e) => e.stopPropagation());
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        placeClickRef.current?.(p);
      });
      markers.set(p.id, new ml.Marker({ element: el, anchor: "center" }).setLngLat([p.lon, p.lat]).addTo(map));
    });
    declutter(map, markers);
  }, [placesKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Area name for the greeting: re-read once tiles around the user have loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me || !areaRef.current) return;
    const read = () => areaRef.current?.(localityNear(map, me));
    read();
    map.once("idle", read);
    return () => {
      map.off("idle", read);
    };
  }, [me?.lat, me?.lon, ready]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } else if (me && follow && places.length) {
      // Frame you + the closest pins, so "around you" is visible on the map, not just in the list.
      const pts = [me, ...places.slice(0, LABELLED_PINS)];
      const lons = pts.map((p) => p.lon);
      const lats = pts.map((p) => p.lat);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding, maxZoom: 16, duration: 700 });
    } else if (me && follow) {
      map.easeTo({ center: [me.lon, me.lat], zoom: Math.max(map.getZoom(), 15), duration: 700, padding });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lon, dest?.lat, dest?.lon, route, ready, follow, placesKey]);

  return (
    <div className={className ?? "absolute inset-0"}>
      <div ref={ref} role="img" aria-label={label} className="h-full w-full bg-sunken" />
    </div>
  );
}
