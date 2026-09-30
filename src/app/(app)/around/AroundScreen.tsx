"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SavedPlace } from "@/server/account/places";
import type { CommunityNote } from "@/server/notes";
import type { RouteLighting } from "@/domain/lighting";
import type { EvidenceState } from "@/domain/evidence-state";
import type { HelpPoint } from "@/domain/help-points";
import { api } from "@/lib/api-client";
import { clearPendingDestination, peekPendingDestination, rememberLocationChoice, setPendingDestination, shouldAutoLocate, useLocation } from "@/lib/location-store";
import { Icon } from "@/components/ui/Icon";
import { SearchOverlay, type Destination } from "@/components/app/SearchOverlay";
import { CommunityPulse } from "@/components/app/CommunityPulse";
import { SafetyUpdatesSection } from "@/components/app/SafetyUpdates";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { lightingEvidenceLine } from "@/components/app/LightingSummary";

type RouteContext = {
  route: { minutes: number; meters: number; approximate: boolean };
  lighting: RouteLighting | null;
  lightingEvidence: EvidenceState<RouteLighting>;
  helpPoints: HelpPoint[];
  helpEvidence: EvidenceState<HelpPoint[]>;
  notes: CommunityNote[];
};
type RouteResult = { key: string; data: RouteContext | null; error: string | null };

export function AroundScreen({ places, emailAlerts }: { places: SavedPlace[]; emailAlerts: boolean }) {
  const router = useRouter();
  const loc = useLocation(false);
  const shouldRequestLocation = !loc.point;
  const requestLocationAgain = loc.request;
  useEffect(() => { if (shouldRequestLocation && shouldAutoLocate()) void requestLocationAgain(); }, [shouldRequestLocation, requestLocationAgain]);
  const enableLocation = () => { rememberLocationChoice(true); void loc.request(); };
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(() => peekPendingDestination());
  useEffect(() => { if (destination) clearPendingDestination(destination); }, [destination]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const from = loc.point;
  const routeKey = destination && from ? `${from.lat.toFixed(3)},${from.lon.toFixed(3)}:${destination.lat},${destination.lon}` : "";
  useEffect(() => {
    if (!destination || !from) return;
    let live = true;
    void api<RouteContext>("/api/geo/route", { body: { from: { lat: from.lat, lon: from.lon }, to: { lat: destination.lat, lon: destination.lon }, mode: "walk" } }).then((r) => {
      if (live) setRoute({ key: routeKey, data: r.ok ? r.data : null, error: r.ok ? null : r.message });
    });
    return () => { live = false; };
    // Position is rounded in the key so GPS jitter does not trigger repeat route requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  const current = route?.key === routeKey ? route : null;
  const openMap = () => { if (destination) setPendingDestination(destination); router.push("/around/map"); };
  return <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <header><p className="text-sm font-semibold text-accent-strong">Local intelligence</p><h1 className="mt-1 text-[1.9rem] font-semibold">Around</h1><p className="mt-1 text-sm text-ink-muted">Understand a place before you go.</p></header>
      <button type="button" onClick={() => setSearching(true)} className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] border border-line-strong bg-surface px-4 text-left"><Icon name="search" className="text-accent" /><span className="flex-1 font-medium">{destination ? destination.name : "Search a place"}</span><Icon name="chevron" className="size-4 text-ink-subtle" /></button>
      <SafetyAccess emailAlerts={emailAlerts} />
      {destination ? <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Place brief</p>
        <h2 className="mt-2 text-xl font-semibold">{destination.name}</h2>
        {!from ? <div className="mt-3"><p className="text-sm text-ink-muted">Use your location to see the way, lighting and nearby help. You can still explore the map.</p><button type="button" onClick={enableLocation} className="mt-3 min-h-11 rounded-[var(--radius-button)] bg-accent px-4 text-sm font-semibold text-accent-ink">Use my location</button></div>
          : !current ? <p role="status" className="mt-3 text-sm text-ink-muted">Checking the way and its sources…</p>
          : current.error ? <p role="status" className="mt-3 text-sm text-ink-muted">{current.error} You can still open the map.</p>
          : current.data ? <div className="mt-4 space-y-3 text-sm">
            <p className="font-semibold">{current.data.route.approximate ? "Approximate" : "About"} {Math.round(current.data.route.minutes)} min walk</p>
            <p className="flex gap-2"><Icon name="lamp" className="size-4 shrink-0 text-light" /><span>{lightingEvidenceLine(current.data.lightingEvidence, current.data.lighting)}</span></p>
            <p className="flex gap-2"><Icon name="shield" className="size-4 shrink-0 text-accent" /><span>{current.data.helpEvidence.state === "failed" ? "Couldn’t check Help Points on this way." : current.data.helpPoints.length ? `${current.data.helpPoints.length} Help Point${current.data.helpPoints.length === 1 ? "" : "s"} found on this way · confirm hours before relying on them` : "No Help Points found in sources checked. This does not mean none exist."}</span></p>
            {current.data.notes.length ? <p className="text-ink-muted">{current.data.notes.length} released community {current.data.notes.length === 1 ? "note" : "notes"} on this way · open map for context</p> : <p className="text-ink-muted">No confirmed community note on this way yet. That does not mean it is safe.</p>}
          </div> : null}
        <div className="mt-5 flex gap-2"><button type="button" onClick={openMap} className="min-h-11 flex-1 rounded-[var(--radius-button)] bg-accent px-3 text-sm font-semibold text-accent-ink">View route & map</button><Link href="/mira" className="flex min-h-11 items-center justify-center rounded-[var(--radius-button)] border border-line px-4 text-sm font-semibold">Ask Mira</Link></div>
      </section> : <CommunityPulse point={loc.point} />}
      {destination ? <CommunityPulse point={destination} compact /> : null}
      {!loc.point && !destination ? <button type="button" onClick={enableLocation} className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-semibold"><Icon name="locate" className="size-4" /> Use my location for local context</button> : null}
      <button type="button" onClick={() => router.push("/around/map")} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 text-left"><Icon name="pin" className="text-accent" /><span className="flex-1"><strong className="block">Open map</strong><span className="text-sm text-ink-muted">See streets, route options and Help Points</span></span><Icon name="chevron" className="size-4 text-ink-subtle" /></button>
      <SafetyUpdatesSection point={destination ?? loc.point} heading="Official & news updates" />
    </div>
    <SearchOverlay open={searching} onClose={() => setSearching(false)} onPick={(d) => { setDestination(d); setRoute(null); setSearching(false); }} saved={places} near={loc.point} placeholder="Which place?" />
  </div>;
}
