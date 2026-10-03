"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { MovementIntent } from "@/domain/plan-contract";
import type { PlanOption } from "@/domain/plan-options";
import { resolvedOrigin, resolvedDestination } from "@/domain/plan-state";
import type { TileConfig } from "@/server/providers/geo/tiles";
import { api } from "@/lib/api-client";

const WorldMap = dynamic(() => import("@/components/map/WorldMap").then((module) => module.WorldMap), { ssr: false });
type Props = { plan: MovementIntent; option: PlanOption | null };
function subscribeDesktop(listener: () => void) { const media = matchMedia("(min-width: 1024px)"); media.addEventListener("change", listener); return () => media.removeEventListener("change", listener); }
export function DesktopPlanMap(props: Props) { const desktop = useSyncExternalStore(subscribeDesktop, () => matchMedia("(min-width: 1024px)").matches, () => false); return desktop ? <PlanMap {...props} /> : null; }
export function InspectPlanMap(props: Props) { const [open, setOpen] = useState(false); return <details className="lg:hidden" onToggle={(event) => setOpen(event.currentTarget.open)}><summary className="min-h-12 cursor-pointer py-3 font-semibold text-accent-strong">Inspect selected route on map</summary>{open ? <PlanMap {...props} /> : null}</details>; }
/** Plan geometry is exclusively from the imported OSM graph. Google route content is not accepted here. */
export function PlanMap({ plan, option }: Props) {
  const [tiles, setTiles] = useState<TileConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let live = true; void api<{ tiles: TileConfig }>("/api/geo/tiles").then((result) => { if (!live) return; if (result.ok) { setTiles(result.data.tiles); setFailed(false); } else setFailed(true); }); return () => { live = false; }; }, [attempt]);
  const from = resolvedOrigin(plan); const destination = resolvedDestination(plan);
  const eligible = option?.evidence.some((claim) => claim.status === "known" && claim.source.id === "osm-walking-graph");
  return <section aria-label="Selected plan map" className="overflow-hidden rounded-3xl border border-line bg-surface">
    <div className="p-4"><p className="mira-eyebrow">Your plan, on the map</p><h2 className="mt-2 font-semibold">{option?.label ?? "Named places"}</h2><p className="mt-1 text-xs text-ink-muted">{plan.origin.kind === "named" ? plan.origin.query : "Your chosen origin"}{plan.loop ? " · return to start" : ` → ${plan.destination?.query}`}</p></div>
    <div className="relative h-72 bg-sunken lg:h-[min(58dvh,600px)]">
      {tiles ? <WorldMap tiles={tiles} me={null} dest={destination ?? from} places={from ? [{ ...from, id: "chosen-origin", name: plan.origin.kind === "named" ? plan.origin.query : "Chosen origin", icon: "pin" }] : []} route={eligible ? option?.geometry : null} follow={false} padding={{ top: 35, right: 35, bottom: 35, left: 35 }} onReady={setReady} label="Chosen route and named places" /> : null}
      {failed || (tiles && !ready) ? <div role="status" className="absolute left-3 right-3 top-3 rounded-xl bg-surface p-3 text-xs text-ink-muted">{failed ? "Map setup failed. Text, route overview and planning actions remain usable." : "Loading the basemap. Your plan and actions are ready below."}{failed ? <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-1 block min-h-12 font-semibold text-accent-strong">Retry map</button> : null}</div> : null}
    </div>
    <p className="p-4 text-xs text-ink-muted">{option ? `${Math.round(option.minutes)} min · ${(option.meters / 1000).toFixed(1)} km · mapped estimate. ` : "Route not checked. "}No current position is shown. This map does not establish access, lighting or operating service.</p>
  </section>;
}
