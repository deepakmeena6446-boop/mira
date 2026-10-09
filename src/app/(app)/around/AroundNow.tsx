"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useToast } from "@/components/ui/Toast";
import { RootHeader } from "@/components/mira/Frame";
import { LiveNowCard, SkyCard, skyAt, type LiveStat } from "@/components/mira/LiveNow";
import { HelpNextCard } from "@/components/mira/HelpNext";
import { clockIn } from "@/domain/daylight";
import { BriefSummary, EvidenceGlyph, EvidenceLedger } from "@/components/mira/Evidence";
import { BriefMap } from "@/components/mira/BriefMap";
import { SafetyUpdatesSection } from "@/components/app/SafetyUpdates";
import { SignInSheet } from "@/components/app/SignInSheet";
import { PlaceCorrection } from "@/components/app/PlaceCorrection";
import { HELP_ICON } from "@/components/app/kinds";
import { api } from "@/lib/api-client";
import { handOffAsk } from "@/lib/ask-handoff";
import { setPlanDraft } from "@/lib/plan-store";
import { clearPendingDestination, peekPendingDestination, setPendingDestination, shouldAutoLocate, usableLocationPoint, useClock, useLocation } from "@/lib/location-store";
import { useCountry } from "@/lib/locale-store";
import { blindSpotsClaim, daylightClaim, helpClaim, hoursWords, lightingClaim, notesClaim, planBrief, updatesClaim, walkTimeClaim, type Claim, type CommunityNote, type WayOption } from "@/lib/brief";
import { HELP_CLASSES, helpWeightsFor, hoursState, isNight, rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { localTimeInZone } from "@/domain/opening-hours";
import { haversineMeters } from "@/domain/pilot";
import { newPlanDraft, providerPlace } from "@/domain/plan-state";
import type { EvidenceState } from "@/domain/evidence-state";
import type { SafetyUpdatesData } from "@/domain/safety-updates";
import type { SavedPlace } from "@/server/account/places";
import type { TileConfig } from "@/server/providers/geo/tiles";
import { PlaceSheet, queryFor, type PickedPlace } from "../plan/PlanSheets";

type Place = { name: string; lat: number; lon: number; source: "search" | "saved_place" | "selected_point"; placeId?: string; query: string };
type Area = { key: string; help: { points: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> } | null; notes: CommunityNote[] | null | "failed"; updates: { evidence: EvidenceState<SafetyUpdatesData> } | "failed" | null };
type Walk = { key: string; way: WayOption | null; error: string | null };

const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };

/**
 * Around (docs/phase1-ux/01 §3): "What does Mira know around me — or around that place?" A map that
 * answers something (you, Help Points, released notes), a brief for right now, local updates as
 * published, and the community layer, where adding what you noticed is one tap.
 */
export function AroundNow({ signedIn, emailAlerts, places, tiles, openSearch, helpExclude = [], canCorrect = false }: { signedIn: boolean; emailAlerts: boolean; places: SavedPlace[]; tiles: TileConfig; openSearch: boolean; helpExclude?: string[]; canCorrect?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const loc = useLocation(false);
  const clock = useClock();
  const country = useCountry();
  const here = usableLocationPoint(loc, clock?.getTime());
  // A place handed over from Mira (or the map) opens straight into its brief.
  const [handed] = useState(() => peekPendingDestination());
  const [place, setPlace] = useState<Place | null>(() => (handed ? (handed.placeId ? { name: handed.name, lat: handed.lat, lon: handed.lon, source: "search", placeId: handed.placeId, query: providerPlace(handed).query } : { name: handed.name, lat: handed.lat, lon: handed.lon, source: "selected_point", query: handed.name }) : null));
  useEffect(() => { if (handed) clearPendingDestination(handed); }, [handed]);
  const [search, setSearch] = useState(openSearch);
  const [signIn, setSignIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const osmOnly = tiles.provider !== "google";
  const idle = loc.status === "idle";
  const request = loc.request;
  useEffect(() => { if (idle && shouldAutoLocate()) void request(); }, [idle, request]);

  // The focus: a place she chose, else where she is.
  const focus = place ?? (here ? { lat: here.lat, lon: here.lon } : null);
  const areaKey = focus ? `${focus.lat.toFixed(3)},${focus.lon.toFixed(3)}` : "";
  const [area, setAreaState] = useState<Area | null>(null);
  // Each answer merges into this area's record (a new area starts fresh; late answers for an old one are dropped by key).
  const setArea = (key: string, patch: Partial<Omit<Area, "key">>) => setAreaState((a) => ({ ...(a?.key === key ? a : { key, help: null, notes: null, updates: null }), ...patch }));
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!areaKey || !focus) return;
    let live = true;
    const at = { lat: focus.lat, lon: focus.lon };
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { ...at, ...(country.iso ? { country: country.iso } : {}), ...(osmOnly ? { source: "osm" } : {}) } }).then((r) => {
      if (live) setArea(areaKey, { help: r.ok ? { points: r.data.helpPoints.filter((p) => !helpExclude.includes(p.cls)), evidence: r.data.evidence } : { points: [], evidence: { state: "failed", sources: [], retryable: true } } });
    });
    void api<{ notes: CommunityNote[] }>("/api/community/nearby", { body: at }).then((r) => { if (live) setArea(areaKey, { notes: r.ok ? r.data.notes : "failed" }); });
    void api<{ evidence: EvidenceState<SafetyUpdatesData> }>("/api/safety-updates", { body: { ...at, window: 7 } }).then((r) => { if (live) setArea(areaKey, { updates: r.ok ? r.data : "failed" }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, retry]);
  const now = area?.key === areaKey ? area : null;

  // Chosen place + location: the walk there from here (time, lighting along it).
  const walkKey = place && here ? `${here.lat.toFixed(3)},${here.lon.toFixed(3)}>${place.lat},${place.lon}` : "";
  const [walk, setWalk] = useState<Walk | null>(null);
  useEffect(() => {
    if (!walkKey || !place || !here) return;
    let live = true;
    void api<{ route: WayOption["route"]; lighting: WayOption["lighting"]; lightingEvidence: WayOption["lightingEvidence"]; helpPoints: HelpPoint[]; helpEvidence: EvidenceState<HelpPoint[]> }>("/api/geo/route", { body: { from: { lat: here.lat, lon: here.lon }, to: { lat: place.lat, lon: place.lon }, ...(osmOnly ? { source: "osm" } : {}) } }).then((r) => {
      if (live) setWalk({ key: walkKey, way: r.ok ? { route: r.data.route, lighting: r.data.lighting, lightingEvidence: r.data.lightingEvidence, helpPoints: r.data.helpPoints, helpEvidence: r.data.helpEvidence } : null, error: r.ok ? null : r.code === "too_far" ? "Further than a walk — plan it as a ride or transit." : "Couldn’t check the walk there just now." });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkKey]);
  const walkNow = walk?.key === walkKey ? walk : null;

  const zone = deviceZone();
  const localNow = clock ? localTimeInZone(clock, country.timezone ?? zone) : null;
  const ranked = focus && now?.help ? rankHelpPoints(now.help.points, focus, { situation: "nearby", night: localNow ? isNight(Math.floor(localNow.minute / 60)) : false, weights: helpWeightsFor(country.iso), timeZone: country.timezone ?? zone ?? undefined, now: localNow ?? undefined, at: clock?.getTime() }) : [];

  const claims: Claim[] = [];
  if (focus) {
    if (place && here) {
      if (walkNow?.error) claims.push({ id: "time", kind: "none", topic: "Walk there", icon: "clock", claim: walkNow.error });
      else { claims.push({ ...walkTimeClaim(walkNow?.way ?? null, "walk", null, zone), topic: "Walk there from you" }); claims.push(lightingClaim(walkNow?.way ?? null)); }
    }
    claims.push(daylightClaim(clock, focus, country.timezone ?? zone, "now"));
    claims.push(helpClaim(now?.help?.points ?? [], now?.help?.evidence, localNow, place ? "within a short walk of it" : "within a short walk", "now"));
    const notesRow = notesClaim(now?.notes ?? null, place ? "around it" : "around you");
    if (notesRow) claims.push(notesRow);
    claims.push(updatesClaim(now?.updates ?? null, place ? "near there" : "near you"));
    claims.push(blindSpotsClaim("walk"));
  }

  const brief = focus ? planBrief(claims, { mode: "walk", loop: false, notesPending: !now || now.notes === null }) : { items: [], limitation: null };
  const briefChecking = Boolean(focus) && (!now?.help || now.notes === null);
  const [showMap, setShowMap] = useState(false);

  const choose = (p: PickedPlace) => {
    setSearch(false);
    if ("here" in p) { setPlace(null); return; }
    setPlace({ name: p.name, lat: p.lat, lon: p.lon, source: p.source, placeId: p.placeId, query: queryFor(p) });
  };
  const planHere = () => {
    if (!place) return;
    const z = deviceZone() ?? "UTC";
    setPlanDraft({ ...newPlanDraft(new Date(), z), touched: true, activity: (place.query ? `Go to ${place.query}` : "Go to a place you chose").slice(0, 160), ...(here ? { origin: { kind: "device" as const, use: "from_here" as const, point: { lat: here.lat, lon: here.lon } } } : {}), destination: { query: place.query, resolution: { source: place.source, name: place.name, point: { lat: place.lat, lon: place.lon }, ...(place.placeId ? { placeId: place.placeId } : {}) } } });
    router.push("/plan?for=go");
  };
  const savePlace = async () => {
    if (!place) return;
    if (!signedIn) return setSignIn(true);
    setSaving(true);
    const r = await api<{ place: SavedPlace }>("/api/me/places", { body: { label: place.name.slice(0, 40), lat: place.lat, lon: place.lon, address: place.name.slice(0, 160) } });
    setSaving(false);
    toast(r.ok ? `Saved ${place.name} to your places` : r.message, r.ok ? undefined : "error");
  };

  // Released notes show only when there are some: publishing is off in this beta, so an empty list is
  // the usual answer and nothing advertises notes that can't appear. A failed check is in the ledger.
  const notes = Array.isArray(now?.notes) ? now.notes : [];
  // The same three facts as Home, for here or for the chosen place.
  const openNow = ranked.filter((p) => { const h = hoursState(p, localNow ?? undefined, 0, clock?.getTime()); return h.kind === "open_24h" || h.kind === "open_now" || h.kind === "listed_open"; });
  const nearestOpen = openNow[0] ?? null;
  const helpState: LiveStat["state"] = !now?.help ? "loading" : now.help.evidence.state === "failed" ? "failed" : "ok";
  const stats: LiveStat[] = [
    { label: "Help Points open now", value: `${openNow.length}/${now?.help?.points.length ?? 0}`, state: helpState },
    place && here
      ? { label: "walk from you", value: walkNow?.way && !walkNow.error ? `${Math.round(walkNow.way.route.minutes)} min` : "—", state: !walkNow ? "loading" : walkNow.error ? "failed" : "ok" }
      : { label: "to the nearest", value: nearestOpen ? `${nearestOpen.minutes} min` : "—", state: helpState },
    ...(notes.length ? [{ label: notes.length === 1 ? "note from people" : "notes from people", value: String(notes.length), state: "ok" as const }] : []),
  ];
  // Same sentences as Home's card, so "none open" reads the same on both screens. Staffing is said
  // once, in the ledger's "What Mira can't see".
  const helpTotal = now?.help?.points.length ?? 0;
  const line = nearestOpen ? <><strong className="font-semibold text-[color:var(--sky-ink)]">{nearestOpen.name}</strong> is {hoursWords(hoursState(nearestOpen, localNow ?? undefined, 0, clock?.getTime()))}, about {nearestOpen.minutes} min {place ? "from it" : "away"}.</>
    : now?.help && now.help.evidence.state !== "failed"
      ? helpTotal ? <>None of the {helpTotal} Help Points near {place ? "it" : "you"} is listed open right now. Emergency is always one tap away.</> : <>No Help Points found within a short walk in the sources Mira checked.</>
      : null;
  const mapPins = ranked.slice(0, 8).filter((p) => !osmOnly || !p.id.startsWith("g:")).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: HELP_ICON[p.cls] ?? "pin", strong: HELP_CLASSES[p.cls].emergency }));

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        <RootHeader emailAlerts={emailAlerts} eyebrow={place ? `Around ${place.name}` : here && loc.area ? `Around you · ${loc.area}` : "Around you, or around a place you choose"} title="Around" />

        <button type="button" onClick={() => setSearch(true)} className="m-card m-press mt-5 flex min-h-14 w-full items-center gap-3 px-4 text-left">
          <Icon name="search" className="size-5 text-accent" />
          <span className={cx("min-w-0 flex-1 truncate", place ? "font-semibold" : "text-ink-subtle")}>{place ? place.name : "Check a place"}</span>
          {place ? <span role="button" tabIndex={0} aria-label="Back to around me" onClick={(e) => { e.stopPropagation(); setPlace(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setPlace(null); } }} className="grid size-9 place-items-center rounded-full bg-sunken"><Icon name="close" className="size-4" /></span> : <Icon name="chevron" className="size-4 text-ink-subtle" />}
        </button>

        {!focus ? (
          <div className="mt-5">
            <LiveNowCard now={clock} point={null} area={null} stats={[]} line={null} footer={null} locating={loc.status === "asking"} locationState={loc.status} onLocate={() => { void loc.request(); }} onCheckPlace={() => setSearch(true)} />
            <div className="mt-3"><HelpNextCard from="around" check={null} impactLine={null} signedIn={signedIn} country={country.iso ?? null} /></div>
          </div>
        ) : (
          <>
            {/* 1. What's true here, now — the same sky card as Home, for you or for the place you chose. */}
            <div className="mt-5">
              {place ? (
                <SkyCard state={skyAt(clock, focus)} label={`Around ${place.name}, now`} eyebrow={`Around ${place.name}, not where you are`} aside={clock ? clockIn(clock) : null} titleAs="h2" title={<span className="line-clamp-2">{place.name}</span>} strip={clock ? { from: clock, point: focus } : null} stats={stats.slice(1, 2)} />
              ) : (
                <LiveNowCard now={clock} point={focus} area={loc.area} stats={[]} line={line} footer={null} locating={false} locationState={loc.status} onLocate={() => undefined} />
              )}
              <BriefSummary className="mt-3" checking={briefChecking} acknowledgement={place ? `Around ${place.name}, right now — not your current position.` : "Around you, right now."} items={brief.items} limitation={briefChecking ? null : brief.limitation} />
            </div>

            {place ? (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={planHere} className="mira-primary min-h-12 flex-1"><Icon name="route" className="size-5" />Plan going here</button>
                <button type="button" onClick={() => { handOffAsk(`What should I know before going to ${place.name}?`); router.push("/mira"); }} aria-label="Ask Mira about it" className="m-card grid size-12 shrink-0 place-items-center"><Icon name="sparkle" className="size-5 text-accent" /></button>
                <button type="button" onClick={() => void savePlace()} disabled={saving} aria-label={saving ? "Saving" : "Save this place"} className="m-card grid size-12 shrink-0 place-items-center"><Icon name="star" className="size-5" /></button>
              </div>
            ) : null}

            {/* 3. The map answers "where": you, Help Points, released notes, the walk there. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5">
            <button type="button" aria-expanded={showMap} onClick={() => setShowMap((v) => !v)} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-accent-strong"><Icon name="pin" className="size-4" />{showMap ? "Hide map" : "View map"}</button>
            <button type="button" onClick={() => { if (place) setPendingDestination({ name: place.name, lat: place.lat, lon: place.lon, ...(place.placeId && place.source !== "saved_place" ? { placeId: place.placeId } : {}) }); router.push("/around/map"); }} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-accent-strong">
              {place ? "View route & map" : "Open the full map"} <Icon name="arrow" className="size-4" />
            </button>
            </div>
            {showMap ? <BriefMap className="mt-2 h-60" tiles={tiles} me={here ? { lat: here.lat, lon: here.lon } : null} start={place || here ? null : focus} end={place ? { lat: place.lat, lon: place.lon } : null} follow={!place && Boolean(here)} route={walkNow?.way && !walkNow.way.route.approximate ? walkNow.way.route.geometry : null} lighting={walkNow?.way?.lighting?.segments ?? null} pins={mapPins} notes={notes.map((n) => ({ id: n.id, lat: n.lat, lon: n.lon }))} label={place ? `Map around ${place.name}` : "Map around you"} /> : null}

            {ranked.length ? (
              <section aria-labelledby="help-near-h" className="mt-8">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 id="help-near-h" className="m-h">Help Points nearby</h2>
                  <span className="text-xs text-ink-subtle">listed hours · minutes by distance</span>
                </div>
                <ul className="m-card mt-3 divide-y divide-line overflow-hidden">
                  {ranked.slice(0, 4).map((p) => {
                    const h = hoursState(p, localNow ?? undefined, 0, clock?.getTime());
                    return (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken"><Icon name={HELP_ICON[p.cls] ?? "pin"} className="size-4 text-ink-muted" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="line-clamp-2 block text-[0.8125rem] text-ink-muted">{HELP_CLASSES[p.cls].label} · about {p.minutes} min walk · {hoursWords(h, { listed: false })}</span>
                        </span>
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(5)},${p.lon.toFixed(5)}&travelmode=walking`} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${p.name}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken"><Icon name="arrow" className="size-4" /></a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {notes.length ? (
              <section aria-labelledby="people-h" className="mt-8">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 id="people-h" className="m-h">From people here</h2>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle"><EvidenceGlyph kind="people" />Several people agreed</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {notes.slice(0, 3).map((n) => (
                    <li key={n.id} className="rounded-2xl bg-people-soft/50 px-4 py-3">
                      <p className="text-[0.95rem] font-medium">{n.text}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">Week of {n.week} · {n.timeBand} · {Math.round(haversineMeters(focus, n) / 10) * 10} m away</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <EvidenceLedger className="mt-8" title="The details" label="What Mira knows here" items={claims.map((c) => (c.kind === "failed" ? { ...c, action: { label: "Try again", onClick: () => setRetry((n) => n + 1) } } : c))} />

            {/* After the context, never ahead of it: correct what Mira shows, or add what you noticed. Both optional. */}
            {place ? <PlaceCorrection className="mt-4" place={place} canCorrect={canCorrect} signedIn={signedIn} country={country.iso ?? null} /> : null}
            <div className="mt-3">
              <HelpNextCard from="around" check={null} impactLine={null} signedIn={signedIn} country={country.iso ?? null} spot={place ? { lat: place.lat, lon: place.lon, name: place.name } : null} title={place ? "Add what you know about it" : "Add what you see here"} />
            </div>

            <div id="updates" className="mt-8 scroll-mt-4">
              <SafetyUpdatesSection point={focus} heading={place ? `Local updates near ${place.name}` : "Local updates near you"} />
            </div>
          </>
        )}
      </div>
      <PlaceSheet open={search} onClose={() => setSearch(false)} title="Check a place" onPick={choose} saved={places} near={here ? { lat: here.lat, lon: here.lon } : null} allowHere osmOnly={osmOnly} />
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to save places" />
    </div>
  );
}
