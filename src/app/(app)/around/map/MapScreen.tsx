"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { HELP_ICON } from "@/components/app/kinds";
import { Sheet, StateNote } from "@/components/mira/Frame";
import { Row, RowList } from "@/components/mira/Rows";
import { api } from "@/lib/api-client";
import { hoursWords } from "@/lib/brief";
import { planGoingTo } from "@/lib/plan-handoff";
import { clearPendingDestination, peekPendingDestination, setPendingReportSpot, shouldAutoLocate, usableLocationPoint, useClock, useLocation } from "@/lib/location-store";
import { useCountry } from "@/lib/locale-store";
import { HELP_CLASSES, helpWeightsFor, hoursState, isNight, rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { localTimeInZone } from "@/domain/opening-hours";
import { haversineMeters } from "@/domain/pilot";
import type { EvidenceState } from "@/domain/evidence-state";
import type { SavedPlace } from "@/server/account/places";
import type { TileConfig } from "@/server/providers/geo/tiles";
import { PlaceSheet, type PickedPlace } from "../../plan/PlanSheets";

const WorldMap = dynamic(() => import("@/components/map/WorldMap").then((m) => m.WorldMap), { ssr: false, loading: () => <div className="skeleton absolute inset-0 rounded-none" /> });
const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };

type Focus = { name: string; lat: number; lon: number; source: "search" | "saved_place" | "selected_point"; placeId?: string; kind: string };

/**
 * The full map (docs/phase2-ux/00 §5): the same screen language as the journey — the map above, a sheet
 * below. You, Help Points and a chosen place; press and hold anywhere to report that spot or go there.
 */
export function MapScreen({ emailAlerts, places, tiles }: { emailAlerts: boolean; places: SavedPlace[]; tiles: TileConfig }) {
  const router = useRouter();
  const loc = useLocation(false);
  const clock = useClock();
  const country = useCountry();
  const here = usableLocationPoint(loc, clock?.getTime());
  const osmOnly = tiles.provider !== "google";
  const idle = loc.status === "idle";
  const request = loc.request;
  useEffect(() => { if (idle && shouldAutoLocate()) void request(); }, [idle, request]);

  // A place handed over from Around opens selected.
  const [handed] = useState(() => peekPendingDestination());
  const [focus, setFocus] = useState<Focus | null>(() => (handed ? { name: handed.name, lat: handed.lat, lon: handed.lon, source: handed.placeId ? "search" : "selected_point", ...(handed.placeId ? { placeId: handed.placeId } : {}), kind: "Chosen place" } : null));
  useEffect(() => { if (handed) clearPendingDestination(handed); }, [handed]);
  const [search, setSearch] = useState(false);
  const [spot, setSpot] = useState<{ lat: number; lon: number; name: string | null } | null>(null);
  const [recenter, setRecenter] = useState(0);

  // Help Points around you (or the chosen place), ranked as Around ranks them.
  const center = focus ?? (here ? { lat: here.lat, lon: here.lon } : null);
  const key = center ? `${center.lat.toFixed(3)},${center.lon.toFixed(3)}` : "";
  const [help, setHelp] = useState<{ key: string; points: HelpPoint[]; failed: boolean } | null>(null);
  useEffect(() => {
    if (!key || !center) return;
    let live = true;
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { lat: center.lat, lon: center.lon, ...(country.iso ? { country: country.iso } : {}), ...(osmOnly ? { source: "osm" } : {}) } }).then((r) => {
      if (live) setHelp({ key, points: r.ok ? r.data.helpPoints : [], failed: !r.ok || r.data.evidence.state === "failed" });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const zone = country.timezone ?? deviceZone() ?? undefined;
  const localNow = clock ? localTimeInZone(clock, zone ?? "UTC") : null;
  const current = help?.key === key ? help : null;
  const ranked = center && current ? rankHelpPoints(current.points, center, { situation: "nearby", night: localNow ? isNight(Math.floor(localNow.minute / 60)) : false, weights: helpWeightsFor(country.iso), timeZone: zone, now: localNow ?? undefined, at: clock?.getTime() }) : [];
  const pins = ranked.slice(0, 8).filter((p) => !osmOnly || !p.id.startsWith("g:")).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: HELP_ICON[p.cls] ?? "pin", strong: HELP_CLASSES[p.cls].emergency }));

  // A long press names the spot (rough, from the reverse lookup) before offering Report or Go.
  // Lifting the finger after a long press "taps" whatever is under it — here, the sheet's backdrop.
  const openedAt = useRef(0);
  const closeSpot = () => { if (Date.now() - openedAt.current > 600) setSpot(null); };
  const pressed = async (p: { lat: number; lon: number }) => {
    openedAt.current = Date.now();
    setSpot({ lat: p.lat, lon: p.lon, name: null });
    const r = await api<{ label: string | null }>("/api/geo/reverse", { body: { lat: p.lat, lon: p.lon } });
    setSpot((s) => (s && s.lat === p.lat && s.lon === p.lon ? { ...s, name: r.ok ? r.data.label : null } : s));
  };
  const planTo = (to: { name: string; lat: number; lon: number; source: Focus["source"]; placeId?: string }) => { planGoingTo(to, here ? { lat: here.lat, lon: here.lon } : null); router.push("/plan?for=go"); };
  const reportAt = (s: { lat: number; lon: number; name: string | null }) => { setPendingReportSpot(s); router.push("/report?from=map"); };
  const choose = (p: PickedPlace) => {
    setSearch(false);
    if ("here" in p) { setFocus(null); setRecenter((n) => n + 1); return; }
    setFocus({ name: p.name, lat: p.lat, lon: p.lon, source: p.source, placeId: p.placeId, kind: "Chosen place" });
  };
  const walkMin = (p: { lat: number; lon: number }) => (here ? Math.max(1, Math.round(haversineMeters(here, p) / 75)) : null);

  return (
    <div className="flex h-[calc(100dvh-var(--tabbar-space))] flex-col bg-canvas">
      <h1 className="sr-only">{focus ? `Map around ${focus.name}` : "Map around you"}</h1>
      <div className="relative min-h-[45dvh] flex-1">
        <WorldMap tiles={tiles} me={here ? { lat: here.lat, lon: here.lon } : null} dest={focus ? { lat: focus.lat, lon: focus.lon } : null} places={pins} follow={!focus} recenter={recenter} onLongPress={(p) => void pressed(p)} onPlaceClick={(p) => { const hp = ranked.find((x) => x.id === p.id); if (hp) setFocus({ name: hp.name, lat: hp.lat, lon: hp.lon, source: "search", placeId: hp.id, kind: HELP_CLASSES[hp.cls].label }); }} padding={{ top: 90, bottom: 60, left: 40, right: 40 }} label={focus ? `Map around ${focus.name}` : "Map around you"} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between gap-2">
            <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/around"))} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface shadow-[var(--shadow-float)]"><Icon name="back" className="size-5" /></button>
            <SafetyAccess emailAlerts={emailAlerts} compact className="min-w-0" />
          </div>
        </div>
        {here ? <button type="button" onClick={() => { setFocus(null); setRecenter((n) => n + 1); }} aria-label="Centre on me" className="absolute bottom-10 right-3 z-20 grid size-11 place-items-center rounded-full bg-surface shadow-[var(--shadow-float)]"><Icon name="locate" className="size-5 text-accent" /></button> : null}
      </div>

      <section aria-label="On the map" className="m-dock-aware relative z-10 -mt-6 max-h-[46dvh] overflow-y-auto overscroll-contain rounded-t-[var(--radius-sheet)] bg-surface px-4 pt-4 shadow-[var(--shadow-sheet)]">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={() => setSearch(true)} className="m-card m-press flex min-h-14 w-full items-center gap-3 px-4 text-left">
            <Icon name="search" className="size-5 text-accent" />
            <span className={cx("min-w-0 flex-1 truncate", focus ? "font-semibold" : "text-ink-subtle")}>{focus ? focus.name : "Check a place"}</span>
            {focus ? <span role="button" tabIndex={0} aria-label="Back to around me" onClick={(e) => { e.stopPropagation(); setFocus(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setFocus(null); } }} className="grid size-9 place-items-center rounded-full bg-sunken"><Icon name="close" className="size-4" /></span> : <Icon name="chevron" className="size-4 text-ink-subtle" />}
          </button>

          {focus ? (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => planTo(focus)} className="mira-primary min-h-12 flex-1"><Icon name="route" className="size-5" />Plan going here</button>
              <button type="button" onClick={() => reportAt({ lat: focus.lat, lon: focus.lon, name: focus.name })} aria-label={`Report something at ${focus.name}`} className="m-card grid size-12 shrink-0 place-items-center"><Icon name="flag" className="size-5" /></button>
            </div>
          ) : null}

          {!here && !focus ? (
            <StateNote className="mt-3" title={loc.status === "denied" ? "Location is off for Mira" : "See what’s around you"} action={loc.status === "denied" ? null : <button type="button" onClick={() => { void loc.request(); }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-4 text-sm font-semibold text-accent-strong"><Icon name="locate" className="size-4" />{loc.status === "asking" ? "Finding you…" : "Use my location"}</button>}>
              {loc.status === "denied" ? "Allow it in your browser’s site settings, or check any place by name." : "Your location stays on this phone while Mira is open."}
            </StateNote>
          ) : null}

          {ranked.length ? (
            <RowList label={focus ? `Help Points near ${focus.name}` : "Help Points near you"} id="map-help-h" className="mt-6">
              {ranked.slice(0, 3).map((p) => {
                const h = hoursState(p, localNow ?? undefined, 0, clock?.getTime());
                return <Row key={p.id} icon={HELP_ICON[p.cls] ?? "pin"} tone={HELP_CLASSES[p.cls].emergency ? "warm" : "ink"} eyebrow={`${HELP_CLASSES[p.cls].label} · about ${p.minutes} min`} title={p.name} detail={`${hoursWords(h)} · staffing not verified`} onClick={() => setFocus({ name: p.name, lat: p.lat, lon: p.lon, source: "search", placeId: p.id, kind: HELP_CLASSES[p.cls].label })} />;
              })}
            </RowList>
          ) : current?.failed ? <StateNote className="mt-6" title="Couldn’t check Help Points">Emergency and calling still work.</StateNote> : null}

          <p className="m-meta mt-5 px-1">Press and hold anywhere on the map to report that spot, or to go there.</p>
        </div>
      </section>

      <Sheet open={spot !== null} onClose={closeSpot} title="This spot" labelledBy="spot-sheet-title" footer={spot ? <div className="flex gap-2"><button type="button" onClick={() => reportAt(spot)} className="min-h-12 flex-1 rounded-2xl bg-surface font-semibold ring-1 ring-line-strong"><span className="inline-flex items-center gap-2"><Icon name="flag" className="size-4" />Report here</span></button><button type="button" onClick={() => planTo({ name: spot.name ?? "The spot you picked", lat: spot.lat, lon: spot.lon, source: "selected_point" })} className="mira-primary flex-1"><Icon name="route" className="size-5" />Go here</button></div> : null}>
        <p className="font-semibold">{spot?.name ? `Near ${spot.name.replace(/^Near /, "")}` : "The spot you picked on the map"}</p>
        <p className="m-meta mt-1">{spot && walkMin(spot) ? `About ${walkMin(spot)} min walk from you, by distance. ` : ""}A report keeps only a rough area (about 1 km), never this exact spot.</p>
      </Sheet>
      <PlaceSheet open={search} onClose={() => setSearch(false)} title="Check a place" onPick={choose} saved={places} near={here ? { lat: here.lat, lon: here.lon } : null} allowHere osmOnly={osmOnly} />
    </div>
  );
}
