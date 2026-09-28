"use client";

import { iconSvg } from "@/components/ui/icon-paths";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource, MapMouseEvent, MapTouchEvent, Marker } from "maplibre-gl";
import { useDaypart } from "@/lib/daypart-store";

export interface LngLat {
  lat: number;
  lon: number;
}
export interface MapPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Line-icon name (components/ui/icon-paths.ts). */
  icon: string;
  /** Places that are usually staffed day and night (hospital, police) get a stronger ring. */
  strong?: boolean;
}
export interface MapNote {
  id: string;
  lat: number;
  lon: number;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const pt = (p: LngLat, props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [p.lon, p.lat] } });

const LABELLED_PINS = 5;
/** Camera moves are instant under reduced motion (docs/launch-ux/05 §2). */
const motionMs = (ms: number) => (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms);
const MAX_LABELS = 6;

/** Show pin names closest-first, skipping any that would overlap a shown name or another pin. */
function declutter(map: MlMap, markers: Map<string, Marker>) {
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const items = [...markers.values()]
    .map((m) => ({ label: m.getElement().querySelector<HTMLElement>(".mira-pin-label"), pt: map.project(m.getLngLat()) }))
    .filter((x): x is typeof x & { label: HTMLElement } => Boolean(x.label))
    .sort((a, b) => Number(a.label.dataset.rank) - Number(b.label.dataset.rank));
  // Pins first: a pin whose dot lands on a closer pin's dot is hidden (it's still in the list).
  const dots: Box[] = [];
  const pinVisible = items.map(({ label, pt }) => {
    const dot = { x0: pt.x - 15, x1: pt.x + 15, y0: pt.y - 15, y1: pt.y + 15 };
    const ok = !dots.some((d) => hit(dot, d));
    (label.parentElement as HTMLElement).style.visibility = ok ? "" : "hidden";
    if (ok) dots.push(dot);
    return ok ? dot : null;
  });
  // Then names, closest first, skipping any that would overlap a shown name or another pin.
  const shown: Box[] = [];
  items.forEach(({ label, pt }, i) => {
    const own = pinVisible[i];
    const w = Math.min(120, label.textContent!.length * 6.2 + 14);
    const box = { x0: pt.x - w / 2 - 3, x1: pt.x + w / 2 + 3, y0: pt.y + 14, y1: pt.y + 34 }; // name sits under the dot
    const visible = Boolean(own) && shown.length < MAX_LABELS && !shown.some((b) => hit(box, b)) && !dots.some((d) => d !== own && hit(box, d));
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
  onLongPress,
  recenter = 0,
  lighting = null,
  follow = true,
  presence = false,
  onMapClick,
  onReady,
  onArea,
  padding = { top: 140, bottom: 320, left: 40, right: 40 },
  className,
  label,
}: {
  tiles: { url: string; attribution: string; styleUrl?: string | null; nightStyleUrl?: string | null; nightUrl?: string | null; provider?: string };
  me: LngLat | null;
  dest?: LngLat | null;
  route?: Array<[number, number]> | null;
  notes?: MapNote[];
  /** Nearby places as tappable pins; the first few (closest) also show their name. */
  places?: MapPlace[];
  onPlaceClick?: (p: MapPlace) => void;
  /** Press and hold (touch) or right-click (mouse) on the map. */
  onLongPress?: (p: LngLat) => void;
  /** Increment to fly back to `me` (and resume following) — e.g. the "Centre on me" button. */
  recenter?: number;
  /** Street lighting along the route: lit stretches glow warm, dark ones are dotted. */
  lighting?: Array<{ status: "lit" | "dark" | "poles" | "unknown"; coords: Array<[number, number]> }> | null;
  follow?: boolean;
  /** An open journey: "Mira has me", drawn as a slow breathing halo around her own dot (docs/launch-ux/05 §3). */
  presence?: boolean;
  onMapClick?: (p: LngLat) => void;
  onReady?: (ok: boolean) => void;
  /** Nearest locality name from the already-downloaded vector tiles (no extra lookup service). */
  onArea?: (name: string | null) => void;
  padding?: { top: number; bottom: number; left: number; right: number };
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Dark basemap after dark; the map is rebuilt when the style flips (a few times a day at most).
  const night = useDaypart() === "night";
  const styleUrl = (night && tiles.nightStyleUrl) || tiles.styleUrl;
  const rasterUrl = (night && tiles.nightUrl) || tiles.url;
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const clickRef = useRef(onMapClick);
  const readyRef = useRef(onReady);
  const areaRef = useRef(onArea);
  const placeClickRef = useRef(onPlaceClick);
  const longPressRef = useRef(onLongPress);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  // Once the person pans or zooms the map themselves, stop auto-following until they recentre.
  const userMovedRef = useRef(false);
  useEffect(() => {
    clickRef.current = onMapClick;
    readyRef.current = onReady;
    areaRef.current = onArea;
    placeClickRef.current = onPlaceClick;
    longPressRef.current = onLongPress;
  }, [onMapClick, onReady, onArea, onPlaceClick, onLongPress]);

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
          style: styleUrl ?? {
            version: 8,
            sources: { base: { type: "raster", tiles: [rasterUrl], tileSize: 256, maxzoom: 22, attribution: tiles.attribution } },
            layers: [{ id: "base", type: "raster", source: "base" }],
          },
          // Until she's located: the whole world, not any one country's capital (flies to her once known).
          center: me ? [me.lon, me.lat] : [10, 20],
          zoom: me ? 15 : 1.3,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        // A tap right after a long-press shouldn't also count as a map tap.
        let suppressClick = 0;
        map.on("click", (e: MapMouseEvent) => {
          if (Date.now() < suppressClick) return;
          clickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        });
        // Long-press: hold one finger still for 550 ms (any movement is a pan, not a press).
        let hold: ReturnType<typeof setTimeout> | null = null;
        let start: { x: number; y: number } | null = null;
        const cancelHold = () => {
          if (hold) clearTimeout(hold);
          hold = null;
        };
        const fire = (lat: number, lon: number) => {
          suppressClick = Date.now() + 600;
          navigator.vibrate?.(12);
          longPressRef.current?.({ lat, lon });
        };
        map.on("touchstart", (e: MapTouchEvent) => {
          cancelHold();
          if (e.points.length !== 1 || !longPressRef.current) return;
          start = { x: e.point.x, y: e.point.y };
          const { lat, lng } = e.lngLat;
          hold = setTimeout(() => fire(lat, lng), 550);
        });
        map.on("touchmove", (e: MapTouchEvent) => {
          if (start && (e.points.length !== 1 || Math.hypot(e.point.x - start.x, e.point.y - start.y) > 10)) cancelHold();
        });
        map.on("touchend", cancelHold);
        map.on("touchcancel", cancelHold);
        map.on("movestart", cancelHold);
        map.on("dragstart", () => (userMovedRef.current = true));
        map.on("zoomstart", (e: { originalEvent?: Event }) => {
          if (e.originalEvent) userMovedRef.current = true; // pinch/scroll by a person, not our own camera moves
        });
        map.on("contextmenu", (e: MapMouseEvent) => {
          if (!longPressRef.current) return;
          e.preventDefault();
          fire(e.lngLat.lat, e.lngLat.lng);
        });
        let loaded = false;
        map.on("error", () => !loaded && readyRef.current?.(false));
        map.on("moveend", () => declutter(map, markersRef.current));
        ro = new ResizeObserver(() => map.resize());
        ro.observe(ref.current);
        mapRef.current = map;
        map.once("load", () => {
          if (cancelled) return;
          loaded = true;
          // Overlay colors come from the theme (globals.css), so routes stay legible at night.
          const css = getComputedStyle(document.documentElement);
          const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
          const routeColor = token("--map-route", "#1d6b63");
          const glowColor = token("--map-route-glow", "#5fa89e");
          const litColor = token("--map-lit", "#ffc94d");
          const unknownColor = token("--map-unknown", "#7a776f");
          const meColor = token("--map-me", "#2563eb");
          const ring = token("--pin-bg", "#ffffff");
          // App overlays sit on top of whichever basemap style is in use.
          map.addSource("route", { type: "geojson", data: EMPTY });
          map.addSource("lighting", { type: "geojson", data: EMPTY });
          // Under the route: a soft warm glow where the street is lit (or poles are mapped).
          map.addLayer({ id: "lit-glow", type: "line", source: "lighting", filter: ["in", ["get", "status"], ["literal", ["lit", "poles"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": litColor, "line-width": ["case", ["==", ["get", "status"], "lit"], 14, 10], "line-opacity": ["case", ["==", ["get", "status"], "lit"], 0.55, 0.3], "line-blur": 2 } });
          map.addSource("points", { type: "geojson", data: EMPTY });
          map.addSource("notes", { type: "geojson", data: EMPTY });
          map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": glowColor, "line-width": 11, "line-opacity": 0.3 } });
          map.addLayer({ id: "route", type: "line", source: "route", filter: ["!", ["get", "approx"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": routeColor, "line-width": 5 } });
          map.addLayer({ id: "route-approx", type: "line", source: "route", filter: ["get", "approx"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": routeColor, "line-width": 5, "line-dasharray": [1.2, 1.6] } });
          // Over the route: dark stretches as a quiet dotted grey (information, not a warning colour).
          map.addLayer({ id: "lit-dark", type: "line", source: "lighting", filter: ["==", ["get", "status"], "dark"], layout: { "line-cap": "round" }, paint: { "line-color": unknownColor, "line-width": 3, "line-dasharray": [0.4, 1.8] } });
          map.addLayer({ id: "notes", type: "circle", source: "notes", paint: { "circle-radius": 11, "circle-color": unknownColor, "circle-opacity": 0.6, "circle-stroke-color": ring, "circle-stroke-width": 3 } });
          map.addLayer({ id: "me-halo", type: "circle", source: "points", filter: ["==", ["get", "kind"], "me"], paint: { "circle-radius": 22, "circle-color": meColor, "circle-opacity": 0.22 } });
          map.addLayer({ id: "me", type: "circle", source: "points", filter: ["==", ["get", "kind"], "me"], paint: { "circle-radius": 8, "circle-color": meColor, "circle-stroke-color": ring, "circle-stroke-width": 3 } });
          map.addLayer({ id: "dest", type: "circle", source: "points", filter: ["==", ["get", "kind"], "dest"], paint: { "circle-radius": 9, "circle-color": routeColor, "circle-stroke-color": ring, "circle-stroke-width": 4 } });
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
      setReady(false); // a rebuilt map (e.g. night style) must re-add overlays and pins
      ro?.disconnect();
      markers.forEach((m) => m.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rasterUrl, styleUrl]);

  // Data layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const feats: GeoJSON.Feature[] = [];
    if (me) feats.push(pt(me, { kind: "me" }));
    if (dest) feats.push(pt(dest, { kind: "dest" }));
    (map.getSource("points") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    (map.getSource("notes") as GeoJSONSource).setData({ type: "FeatureCollection", features: notes.map((n) => pt(n, { id: n.id })) });
    (map.getSource("lighting") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: (lighting ?? []).filter((s) => s.status !== "unknown").map((s) => ({ type: "Feature", properties: { status: s.status }, geometry: { type: "LineString", coordinates: s.coords } })),
    });
    (map.getSource("route") as GeoJSONSource).setData(
      route && route.length > 1
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { approx: route.length === 2 }, geometry: { type: "LineString", coordinates: route } }] }
        : EMPTY,
    );
  }, [me, dest, route, notes, lighting, ready]);

  // Place pins (HTML markers: crisp line icons, keyboard-focusable, work on any basemap).
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
      dot.className = p.strong ? "mira-pin-dot mira-pin-strong" : "mira-pin-dot";
      dot.innerHTML = iconSvg(p.icon, 16); // static glyph markup from our own icon set, never user text
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

  // The panels over the map, as the map's own padding: centring and fitting then happen in the
  // visible part. Set once here, never per camera call — MapLibre adds a call's padding on top
  // of the map's, which made route fits fail silently on a phone-sized screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPadding(padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, padding.top, padding.bottom, padding.left, padding.right]);

  // Camera: fit the route or follow the user — but never fight someone exploring the map.
  const destKey = dest ? `${dest.lat},${dest.lon}` : "";
  const lastDestKey = useRef(destKey);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (destKey !== lastDestKey.current) {
      lastDestKey.current = destKey; // a new destination is always framed
      userMovedRef.current = false;
    }
    if (userMovedRef.current) return;
    const coords: Array<[number, number]> = route && route.length > 1 ? route : dest && me ? [[me.lon, me.lat], [dest.lon, dest.lat]] : [];
    if (coords.length > 1) {
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { maxZoom: 17, duration: motionMs(700) });
    } else if (dest) {
      map.easeTo({ center: [dest.lon, dest.lat], zoom: 16, duration: motionMs(700) });
    } else if (me && follow && places.length) {
      // Frame you + the closest pins, so "around you" is visible on the map, not just in the list.
      const pts = [me, ...places.slice(0, LABELLED_PINS)];
      const lons = pts.map((p) => p.lon);
      const lats = pts.map((p) => p.lat);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { maxZoom: 16, duration: motionMs(700) });
    } else if (me && follow) {
      map.easeTo({ center: [me.lon, me.lat], zoom: Math.max(map.getZoom(), 15), duration: motionMs(700) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lon, destKey, route, ready, follow, placesKey]);

  // Presence halo: the one ambient loop, only on an active journey, only while visible, ≤ 30 fps;
  // static under reduced motion; stopped (not breathing) whenever `presence` is false.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("me-halo")) return;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--map-route").trim() || "#1d6b63";
    const me = css.getPropertyValue("--map-me").trim() || "#2563eb";
    map.setPaintProperty("me-halo", "circle-color", presence ? accent : me);
    map.setPaintProperty("me-halo", "circle-radius", 22);
    map.setPaintProperty("me-halo", "circle-opacity", presence ? 0.2 : 0.22);
    if (!presence || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.visibilityState !== "visible" || t - last < 33) return;
      last = t;
      const phase = (Math.sin(((t - t0) / 3200) * 2 * Math.PI) + 1) / 2;
      map.setPaintProperty("me-halo", "circle-radius", 22 + phase * 6);
      map.setPaintProperty("me-halo", "circle-opacity", 0.24 - phase * 0.12);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [presence, ready]);

  // "Centre on me": always flies back and resumes following, even if the fix hasn't changed.
  useEffect(() => {
    const map = mapRef.current;
    if (!recenter || !map || !ready || !me) return;
    userMovedRef.current = false;
    map.easeTo({ center: [me.lon, me.lat], zoom: Math.max(map.getZoom(), 15), duration: motionMs(600) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter]);

  return (
    <div className={className ?? "absolute inset-0"}>
      {/* A labelled region (not role="img"), so the place pins inside stay reachable by screen readers. */}
      <div ref={ref} role="region" aria-label={label} className="h-full w-full bg-sunken" />
      {/* Google Map Tiles terms: the official Google Maps logo, unmodified, 16–19 px tall with ≥ 10 px
          clear space, visible on the map (the sheet covers the bottom). Outlined variants are the ones
          for busy backgrounds: light outline on the day map, dark outline on the night map. */}
      {tiles.provider === "google" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a fixed-size vendor mark; next/image adds nothing here
        <img
          src={night ? "/attribution/google-maps-dark-outline.svg" : "/attribution/google-maps-light-outline.svg"}
          alt="Google Maps"
          width={86}
          height={18}
          draggable={false}
          className="mira-maplogo pointer-events-none absolute left-3 z-10 h-[18px] w-auto select-none"
          style={{ top: padding.top + 10 }}
        />
      ) : null}
    </div>
  );
}
