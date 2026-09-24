"use client";

import { useState } from "react";
import { MapView, type MapMarker, type MapRoute, type MapStatus } from "@/components/map/MapView";
import { Notice } from "@/components/ui/Notice";
import { cx } from "@/components/ui/cx";
import type { PilotInfo } from "@/domain/know-types";

type View = "map" | "list";
type Snap = "evidence" | "map";

/**
 * Map + evidence layout (UX spec §8). Mobile: map on top with an evidence sheet
 * below that has two snap points; the sheet never overlays the map, so attribution
 * and controls stay visible. Desktop: map beside the cards. The list view and any
 * map failure keep every fact available as text.
 */
export function KnowLayout({
  pilot,
  markers,
  routes,
  selectedRoute,
  mapLabel,
  children,
}: {
  pilot: PilotInfo;
  markers: MapMarker[];
  routes?: MapRoute[];
  selectedRoute?: string | null;
  mapLabel: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<View>("map");
  const [snap, setSnap] = useState<Snap>("evidence");
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const showMap = view === "map" && mapStatus !== "failed";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Result view" className="inline-flex rounded-full border border-line-strong bg-surface p-1">
          {(["map", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cx("min-h-10 rounded-full px-4 text-sm font-semibold", view === v ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink")}
            >
              {v === "map" ? "Map and details" : "Text only"}
            </button>
          ))}
        </div>
        {showMap ? (
          <button
            type="button"
            onClick={() => setSnap((s) => (s === "evidence" ? "map" : "evidence"))}
            aria-expanded={snap === "map"}
            className="min-h-10 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-soft md:hidden"
          >
            {snap === "evidence" ? "Larger map" : "Smaller map"}
          </button>
        ) : null}
      </div>

      {view === "map" && mapStatus === "failed" ? (
        <Notice tone="attention" role="status" title="The map couldn't load">
          All place and route information is still shown below as text.
        </Notice>
      ) : null}

      <div className={cx("md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-start md:gap-5")}>
        {view === "map" ? (
          <div className={cx(mapStatus === "failed" && "hidden", "md:sticky md:top-20")}>
            <MapView
              tiles={pilot.tiles}
              bounds={pilot.bounds}
              markers={markers}
              routes={routes}
              selectedRoute={selectedRoute ?? null}
              label={mapLabel}
              onStatus={setMapStatus}
              className={cx(
                "w-full transition-[height] duration-200",
                snap === "evidence" ? "h-[34dvh] min-h-56" : "h-[62dvh]",
                "md:h-[calc(100dvh-9rem)] md:min-h-96",
              )}
            />
          </div>
        ) : null}
        <div
          className={cx(
            "flex flex-col gap-4",
            view === "map" && mapStatus !== "failed" && "mt-3 md:mt-0",
            view === "list" && "md:col-span-2 md:max-w-3xl",
          )}
        >
          {view === "map" && mapStatus !== "failed" ? <div aria-hidden className="mx-auto h-1.5 w-12 rounded-full bg-line-strong md:hidden" /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
