"use client";

import dynamic from "next/dynamic";
import { cx } from "@/components/ui/cx";
import type { TileConfig } from "@/server/providers/geo/tiles";

const WorldMap = dynamic(() => import("@/components/map/WorldMap").then((m) => m.WorldMap), { ssr: false, loading: () => <div className="skeleton h-full w-full rounded-none" /> });

type Pin = { id: string; name: string; lat: number; lon: number; icon: string; strong?: boolean };

/**
 * The map inside a brief: shown because there is a way or places to show, never as a backdrop.
 * Everything drawn here is also stated as text in the brief, so a map failure hides nothing.
 */
export function BriefMap({ tiles, start, end, route, lighting, pins = [], notes = [], me = null, follow = false, label, className, onPinClick }: {
  tiles: TileConfig;
  start: { lat: number; lon: number } | null;
  end: { lat: number; lon: number } | null;
  route: Array<[number, number]> | null;
  lighting?: Array<{ status: "lit" | "dark" | "poles" | "unknown"; coords: Array<[number, number]> }> | null;
  pins?: Pin[];
  /** Released community notes, drawn softly (never as a heat map). */
  notes?: Array<{ id: string; lat: number; lon: number }>;
  me?: { lat: number; lon: number } | null;
  /** "Around me": frame you and the nearest pins instead of a destination. */
  follow?: boolean;
  label: string;
  className?: string;
  onPinClick?: (id: string) => void;
}) {
  const places = [...(start && !me ? [{ id: "start", name: "Start", lat: start.lat, lon: start.lon, icon: "pin" }] : []), ...pins];
  return (
    <div className={cx("relative overflow-hidden rounded-[var(--radius-tile)] bg-sunken ring-1 ring-line", className ?? "h-56")}>
      <WorldMap tiles={tiles} me={me} dest={end ?? (follow && me ? null : start)} route={route} lighting={lighting ?? null} places={places} notes={notes} follow={follow} padding={{ top: 36, bottom: 36, left: 36, right: 36 }} label={label} className="absolute inset-0" onPlaceClick={onPinClick ? (p) => onPinClick(p.id) : undefined} />
    </div>
  );
}
