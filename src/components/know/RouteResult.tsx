"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { KnowResponse, PilotInfo } from "@/domain/know-types";
import { KnowLayout } from "./KnowLayout";
import { CommunityEvidence, RouteCard, SourcesDetails, UnknownsSection } from "./Evidence";
import { Notice } from "@/components/ui/Notice";
import type { MapMarker, MapRoute } from "@/components/map/MapView";

export function RouteResult({ pilot, data, originCoords }: { pilot: PilotInfo; data: KnowResponse; originCoords: { lat: number; lon: number } | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    const o = data.origin?.point ?? originCoords;
    if (o) m.push({ lat: o.lat, lon: o.lon, role: "origin" });
    if (data.destination) m.push({ lat: data.destination.point.lat, lon: data.destination.point.lon, role: "destination" });
    return m;
  }, [data, originCoords]);
  const routes = useMemo<MapRoute[]>(
    () => (data.routes ?? []).map((r) => ({ id: r.id, geometry: r.geometry, variant: r.id === "A" ? "primary" : "secondary" })),
    [data.routes],
  );

  if (data.coverage === "outside") {
    return (
      <Notice tone="attention" role="status" title="MIRA does not cover this area yet">
        Your starting point is outside the pilot area (Delhi University North Campus around Vishwavidyalaya Metro), so there&apos;s no route comparison.
        Pick a starting place inside the pilot instead, or see{" "}
        {data.destination ? <Link href={`/know/place/${data.destination.id}`}>what&apos;s known about {data.destination.name}</Link> : "a pilot place"}.
      </Notice>
    );
  }

  return (
    <section aria-labelledby="route-result-h" className="flex flex-col gap-4">
      <header>
        <h2 id="route-result-h" className="text-2xl font-bold text-mixed">
          {data.origin?.name} → {data.destination?.name}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{data.time.label}</p>
      </header>
      <KnowLayout
        pilot={pilot}
        markers={markers}
        routes={routes}
        selectedRoute={selected}
        mapLabel={`Map of walking paths from ${data.origin?.name ?? "start"} to ${data.destination?.name ?? "destination"}`}
      >
        {data.routeUnavailable ? (
          <Notice tone="neutral" role="status" title={data.routeUnavailable.message}>
            {data.routeUnavailable.reason === "not_near_walkway"
              ? "One of the points is more than 100 m from any mapped walkway, so MIRA won't guess a path."
              : data.routeUnavailable.reason === "no_connected_path"
                ? "The mapped walkways near these points aren't connected in the map snapshot. MIRA won't draw a straight line instead."
                : "Pick two different places to compare paths."}{" "}
            {data.destination ? <Link href={`/know/place/${data.destination.id}`}>See place information for {data.destination.name}</Link> : null}
          </Notice>
        ) : null}
        {data.routes?.length ? (
          <>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <h3 className="font-bold">How these paths differ</h3>
              <ul className="mt-2 space-y-1 text-ink-muted">
                {data.comparison?.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-muted">MIRA doesn&apos;t rank paths or recommend one. Choose what suits you.</p>
            </div>
            {data.routes.map((r) => (
              <RouteCard key={r.id} route={r} selected={selected === r.id} onSelect={data.routes!.length > 1 ? () => setSelected((s) => (s === r.id ? null : r.id)) : undefined} />
            ))}
          </>
        ) : null}
        <CommunityEvidence community={data.community} />
        <UnknownsSection unknowns={data.unknowns} />
        <SourcesDetails source={data.source} />
      </KnowLayout>
    </section>
  );
}
