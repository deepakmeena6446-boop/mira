"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useToast } from "@/components/ui/Toast";
import { MiraVoice, RootHeader, StateNote } from "@/components/mira/Frame";
import { EvidenceGlyph, EvidenceLedger } from "@/components/mira/Evidence";
import { BriefMap } from "@/components/mira/BriefMap";
import { SafetyUpdatesSection } from "@/components/app/SafetyUpdates";
import { SignInSheet } from "@/components/app/SignInSheet";
import { HELP_ICON } from "@/components/app/kinds";
import { api } from "@/lib/api-client";
import { handOffAsk } from "@/lib/ask-handoff";
import { setPlanDraft } from "@/lib/plan-store";
import { clearPendingDestination, peekPendingDestination, rememberLocationChoice, shouldAutoLocate, usableLocationPoint, useClock, useLocation } from "@/lib/location-store";
import { useCountry } from "@/lib/locale-store";
import { blindSpotsClaim, daylightClaim, helpClaim, hoursWords, lightingClaim, notesClaim, updatesClaim, walkTimeClaim, type Claim, type CommunityNote, type WayOption } from "@/lib/brief";
import { HELP_CLASSES, helpWeightsFor, hoursState, isNight, rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { localTimeInZone } from "@/domain/opening-hours";
import { haversineMeters } from "@/domain/pilot";
import { newPlanDraft } from "@/domain/plan-state";
import type { EvidenceState } from "@/domain/evidence-state";
import type { SafetyUpdatesData } from "@/domain/safety-updates";
import type { SavedPlace } from "@/server/account/places";
import type { TileConfig } from "@/server/providers/geo/tiles";
import { PlaceSheet, type PickedPlace } from "../plan/PlanSheets";

type Place = { name: string; lat: number; lon: number; source: "search" | "saved_place" | "selected_point"; placeId?: string };
type Area = { key: string; help: { points: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> } | null; notes: CommunityNote[] | null; updates: { evidence: EvidenceState<SafetyUpdatesData> } | "failed" | null };
type Walk = { key: string; way: WayOption | null; error: string | null };

const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };

/**
 * Around (docs/phase1-ux/01 §3): "What does Mira know around me — or around that place?" A map that
 * answers something (you, Help Points, released notes), a brief for right now, local updates as
 * published, and the community layer, where adding what you noticed is one tap.
 */
export function AroundNow({ signedIn, emailAlerts, places, tiles, openSearch }: { signedIn: boolean; emailAlerts: boolean; places: SavedPlace[]; tiles: TileConfig; openSearch: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const loc = useLocation(false);
  const clock = useClock();
  const country = useCountry();
  const here = usableLocationPoint(loc, clock?.getTime());
  // A place handed over from Mira (or the map) opens straight into its brief.
  const [handed] = useState(() => peekPendingDestination());
  const [place, setPlace] = useState<Place | null>(() => (handed ? { name: handed.name, lat: handed.lat, lon: handed.lon, source: "selected_point" } : null));
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
      if (live) setArea(areaKey, { help: r.ok ? { points: r.data.helpPoints, evidence: r.data.evidence } : { points: [], evidence: { state: "failed", sources: [], retryable: true } } });
    });
    void api<{ notes: CommunityNote[] }>("/api/community/nearby", { body: at }).then((r) => { if (live) setArea(areaKey, { notes: r.ok ? r.data.notes : [] }); });
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
    claims.push(notesClaim(now?.notes ?? null, place ? "around it" : "around you"));
    claims.push(updatesClaim(now?.updates ?? null, place ? "near there" : "near you"));
    claims.push(blindSpotsClaim("walk"));
  }

  const choose = (p: PickedPlace) => {
    setSearch(false);
    if ("here" in p) { setPlace(null); return; }
    setPlace({ name: p.name, lat: p.lat, lon: p.lon, source: p.source, placeId: p.placeId });
  };
  const planHere = () => {
    if (!place) return;
    const z = deviceZone() ?? "UTC";
    setPlanDraft({ ...newPlanDraft(new Date(), z), touched: true, activity: `Go to ${place.name}`.slice(0, 160), ...(here ? { origin: { kind: "device" as const, use: "from_here" as const, point: { lat: here.lat, lon: here.lon } } } : {}), destination: { query: place.name.slice(0, 160), resolution: { source: place.source, name: place.name, point: { lat: place.lat, lon: place.lon }, ...(place.placeId ? { placeId: place.placeId } : {}) } } });
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

  const notes = now?.notes ?? [];
  const mapPins = ranked.slice(0, 8).filter((p) => !osmOnly || !p.id.startsWith("g:")).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: HELP_ICON[p.cls] ?? "pin", strong: HELP_CLASSES[p.cls].emergency }));

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        <RootHeader emailAlerts={emailAlerts} eyebrow={place ? "Around a place" : here && loc.area ? loc.area : "Local intelligence"} title="Around" />

        <button type="button" onClick={() => setSearch(true)} className="m-card m-press mt-5 flex min-h-14 w-full items-center gap-3 px-4 text-left">
          <Icon name="search" className="size-5 text-accent" />
          <span className={cx("min-w-0 flex-1 truncate", place ? "font-semibold" : "text-ink-subtle")}>{place ? place.name : "Check a place"}</span>
          {place ? <span role="button" tabIndex={0} aria-label="Back to around me" onClick={(e) => { e.stopPropagation(); setPlace(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setPlace(null); } }} className="grid size-9 place-items-center rounded-full bg-sunken"><Icon name="close" className="size-4" /></span> : <Icon name="chevron" className="size-4 text-ink-subtle" />}
        </button>

        {!focus ? (
          <section className="mt-6">
            <MiraVoice size="lg">I can show what I know around you — Help Points open now, notes from people, local reports — or around any place you’re thinking of going.</MiraVoice>
            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => { rememberLocationChoice(true); void loc.request(); }} className="mira-primary w-full"><Icon name="locate" className="size-5" />{loc.status === "asking" ? "Finding you…" : "Use my location"}</button>
              <button type="button" onClick={() => setSearch(true)} className="min-h-12 w-full rounded-2xl font-semibold ring-1 ring-line-strong">Check a place instead</button>
            </div>
            {loc.status === "denied" ? <StateNote className="mt-3" title="Location is off for Mira">Allow it in your browser’s site settings to see what’s around you. Checking a place works without it.</StateNote> : loc.status === "unavailable" ? <StateNote className="mt-3" title="Couldn’t find you">Try again outdoors, or check a place by name.</StateNote> : null}
          </section>
        ) : (
          <>
            <BriefMap className="mt-4 h-60" tiles={tiles} me={here ? { lat: here.lat, lon: here.lon } : null} start={place || here ? null : focus} end={place ? { lat: place.lat, lon: place.lon } : null} follow={!place && Boolean(here)} route={walkNow?.way && !walkNow.way.route.approximate ? walkNow.way.route.geometry : null} lighting={walkNow?.way?.lighting?.segments ?? null} pins={mapPins} notes={notes.map((n) => ({ id: n.id, lat: n.lat, lon: n.lon }))} label={place ? `Map around ${place.name}` : "Map around you"} />

            {place ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button type="button" onClick={planHere} className="mira-primary col-span-3 w-full"><Icon name="route" className="size-5" />Plan going here</button>
                <button type="button" onClick={() => { handOffAsk(`What should I know before going to ${place.name}?`); router.push("/mira"); }} className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-semibold ring-1 ring-line-strong"><Icon name="sparkle" className="size-4 text-accent" />Ask Mira about it</button>
                <button type="button" onClick={() => void savePlace()} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-surface text-sm font-semibold ring-1 ring-line-strong"><Icon name="star" className="size-4" />{saving ? "Saving…" : "Save"}</button>
              </div>
            ) : null}

            <EvidenceLedger className="mt-4" title={place ? "Around this place, now" : "Around you, now"} label="What Mira knows here" items={claims.map((c) => (c.kind === "failed" ? { ...c, action: { label: "Try again", onClick: () => setRetry((n) => n + 1) } } : c))} />

            {ranked.length ? (
              <section aria-labelledby="help-near-h" className="mt-6">
                <h2 id="help-near-h" className="m-label">Help Points nearby · listed hours, staffing not verified</h2>
                <ul className="m-card mt-2 divide-y divide-line overflow-hidden">
                  {ranked.slice(0, 4).map((p) => {
                    const h = hoursState(p, localNow ?? undefined, 0, clock?.getTime());
                    return (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken"><Icon name={HELP_ICON[p.cls] ?? "pin"} className="size-[18px] text-ink-muted" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="line-clamp-2 block text-[0.8125rem] text-ink-muted">{HELP_CLASSES[p.cls].label} · about {p.minutes} min walk · {hoursWords(h)}</span>
                        </span>
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(5)},${p.lon.toFixed(5)}&travelmode=walking`} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${p.name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken"><Icon name="arrow" className="size-4" /></a>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-xs text-ink-subtle">Walking minutes are by distance; the route isn’t checked.</p>
              </section>
            ) : null}

            <section aria-labelledby="people-h" className="mt-7">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="people-h" className="text-[1.0625rem] font-semibold">From people here</h2>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle"><EvidenceGlyph kind="people" />Released notes</span>
              </div>
              {now?.notes === null ? <p role="status" className="mt-2 text-sm text-ink-muted">Checking notes…</p> : notes.length ? (
                <ul className="mt-2 space-y-2">
                  {notes.slice(0, 3).map((n) => (
                    <li key={n.id} className="rounded-2xl bg-people-soft/60 px-4 py-3">
                      <p className="text-[0.95rem] font-medium">{n.text}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">Week of {n.week} · {n.timeBand} · {Math.round(haversineMeters(focus, n) / 10) * 10} m away</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">No released notes {place ? "around this place" : "around you"} yet. Notes appear only once several people say similar things, so a quiet area may simply be new to Mira.</p>
              )}
              <p className="mt-4 text-sm font-semibold">Noticed something? It takes a few seconds.</p>
              <div className="m-scroll-x -mx-4 mt-2 px-4 pb-1">
                {[
                  { href: "/report?from=around", icon: "flag", label: "Something happened", hint: "Private report" },
                  { href: "/contribute#checks", icon: "check", label: "Answer a Mira Check", hint: "Was it open?" },
                  { href: "/contribute", icon: "lamp", label: "Was the way lit?", hint: "After a walk" },
                  { href: "/contribute", icon: "pin", label: "A place is wrong", hint: "Closed, moved" },
                ].map((c) => (
                  <Link key={c.label} href={c.href} className="m-card m-press flex min-w-[9.5rem] shrink-0 flex-col gap-1 p-3">
                    <Icon name={c.icon} className="size-5 text-people" />
                    <span className="text-sm font-semibold leading-tight">{c.label}</span>
                    <span className="text-xs text-ink-muted">{c.hint}</span>
                  </Link>
                ))}
              </div>
            </section>

            <div id="updates" className="mt-7 scroll-mt-4">
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
