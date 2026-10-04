"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { ActionBar, MiraVoice, QuestionRow, StateNote } from "@/components/mira/Frame";
import { EvidenceChip, EvidenceLedger, type EvidenceItem } from "@/components/mira/Evidence";
import { Row, RowAction, RowList } from "@/components/mira/Rows";
import { BriefMap } from "@/components/mira/BriefMap";
import { SkyCard, skyAt, type LiveStat } from "@/components/mira/LiveNow";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { SignInSheet } from "@/components/app/SignInSheet";
import { TimeZoneChoices } from "@/components/app/TimeZoneChoices";
import { HELP_ICON } from "@/components/app/kinds";
import { api } from "@/lib/api-client";
import { handOffAsk } from "@/lib/ask-handoff";
import { clearPlanDraft, ensurePlanDraft, setPlanDraft, usePlanDraft, usePlanHydrated } from "@/lib/plan-store";
import { currentLocation, usableLocationPoint, useClock, useLocation } from "@/lib/location-store";
import { blindSpotsClaim, daylightClaim, helpClaim, lightingClaim, notesClaim, updatesClaim, walkTimeClaim, type Claim, type CommunityNote, type WayOption } from "@/lib/brief";
import { decisionTake } from "@/lib/decision-take";
import { HELP_CLASSES, hoursState, type HelpPoint } from "@/domain/help-points";
import { localTimeInZone } from "@/domain/opening-hours";
import { clockChangeAt, daylightAt, instantForLocal, laterDaylight, localTimeForInstant, type PlanOptionsResult } from "@/domain/plan-options";
import { activatePlanLeg, intentFromDraft, newPlanDraft, returnLegFromMain, type PlanDraft, type PlanLegDraft } from "@/domain/plan-state";
import { emergencyActions, statusWords, type CountryContext } from "@/domain/country-context";
import type { EvidenceState } from "@/domain/evidence-state";
import type { SafetyUpdatesData } from "@/domain/safety-updates";
import type { RouteLighting } from "@/domain/lighting";
import type { SavedPlace } from "@/server/account/places";
import type { TileConfig } from "@/server/providers/geo/tiles";
import { PlaceSheet, WhenSheet, whenWords, type PickedPlace } from "./PlanSheets";
import { loopWord, placeName, planTitle } from "@/domain/plan-name";
import { GoSheet, type GoTarget } from "./GoSheet";
import { clockIn } from "@/domain/daylight";

export type Situation = "go" | "run" | "travel";
type Mode = "walk" | "ride" | "transit";
type WalkAnswer = { route: WayOption["route"]; lighting: RouteLighting | null; lightingEvidence: EvidenceState<RouteLighting>; helpPoints: HelpPoint[]; helpEvidence: EvidenceState<HelpPoint[]>; notes: CommunityNote[]; alternatives: Array<Omit<WayOption, never>> };
type ModeAnswer = { mode: Mode; route: (WayOption["route"] & { provider: string }) | null; arrivalHelp: HelpPoint[]; arrivalEvidence?: EvidenceState<HelpPoint[]> };
type Ways = { key: string; ways: WayOption[]; notes: CommunityNote[] | null | "failed"; error: string | null; noRoute?: boolean };

const SITUATIONS: Array<{ id: Situation; label: string; icon: string }> = [
  { id: "go", label: "Going somewhere", icon: "route" },
  { id: "run", label: "Run or walk", icon: "walk" },
  { id: "travel", label: "Travelling", icon: "airport" },
];
const MODES: Array<{ id: Mode; label: string }> = [{ id: "walk", label: "Walk" }, { id: "ride", label: "Taxi / ride" }, { id: "transit", label: "Transit" }];
const LENGTHS = [15, 30, 45, 60, 90];
const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
/** Two zone names that keep the same clock (e.g. Asia/Calcutta and Asia/Kolkata) count as the same. */
const sameClock = (a: string, b: string) => { try { const at = new Date(); const f = (z: string) => new Intl.DateTimeFormat("en", { timeZone: z, hour: "2-digit", minute: "2-digit", day: "2-digit", hourCycle: "h23" }).format(at); return f(a) === f(b); } catch { return a === b; } };
const validZone = (z: string) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } };
const pointOf = (p: PlanDraft["origin"] | PlanDraft["destination"]) => ("kind" in p && p.kind === "device" ? p.point : "resolution" in p && p.resolution ? p.resolution.point : null);

/** Which situation a draft describes (a loop is a run or walk; a ride to a stay is an arrival). */
function situationOf(draft: PlanDraft): Situation {
  return draft.loop ? "run" : draft.mode !== "walk" && /arriv|land|flight|hotel|stay/i.test(draft.activity) ? "travel" : "go";
}

/** Situation preset, applied once to an untouched draft (never over her own entries). */
function preset(input: PlanDraft, s: Situation, here: { lat: number; lon: number } | null): PlanDraft {
  // A preset applies only to an untouched or new draft, so "now" must be now — not when the blank draft was made.
  const zone = input.timeZone && validZone(input.timeZone) ? input.timeZone : deviceZone();
  const draft = { ...input, timeZone: zone, departureLocal: localTimeForInstant(new Date(), zone), timeKind: "depart_at" as const };
  const origin = here && draft.origin.kind === "named" && !draft.origin.query ? { kind: "device" as const, use: "from_here" as const, point: here } : draft.origin;
  if (s === "run") return { ...draft, touched: true, activity: draft.activity || "Run", loop: true, mode: "walk", loopTarget: draft.loopTarget ?? { kind: "duration", value: 30 }, paceMinutesPerKm: draft.paceMinutesPerKm ?? 6, origin };
  if (s === "travel") return { ...draft, touched: true, activity: draft.activity || "Arrive and get to where I’m staying", loop: false, mode: "ride", loopTarget: undefined };
  return { ...draft, touched: true, activity: draft.activity || "Go somewhere", loop: false, loopTarget: undefined, origin };
}

/**
 * Plan / decision (docs/phase1-ux/01 §3): situation → a few questions → a Mira Brief for that place at
 * that time → Go with Mira. Evidence comes from the existing route, help, notes, updates and reverse
 * APIs; nothing is scored and every gap is said.
 */
export function PlanDecision({ signedIn, emailAlerts, places, tiles, initialFor }: { signedIn: boolean; emailAlerts: boolean; places: SavedPlace[]; tiles: TileConfig; initialFor: Situation | null }) {
  const router = useRouter();
  const draft = usePlanDraft();
  const hydrated = usePlanHydrated();
  const loc = useLocation(false);
  const clock = useClock();
  const here = usableLocationPoint(loc, clock?.getTime());
  const [situation, setSituation] = useState<Situation>(initialFor ?? "go");
  const [sheet, setSheet] = useState<"origin" | "destination" | "when" | "go" | null>(null);
  /** A leg sheet: where the way back returns to, or when it leaves. */
  const [legSheet, setLegSheet] = useState<{ index: number; kind: "place" | "stop" | "when" } | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<{ busy: boolean; text: string | null }>({ busy: false, text: null });
  const osmOnly = tiles.provider !== "google";

  useEffect(ensurePlanDraft, [draft]);
  // Apply the situation preset once, to an untouched draft. A draft handed over from Home or Mira keeps its entries.
  useEffect(() => {
    if (!hydrated || !draft) return;
    const at = here ? { lat: here.lat, lon: here.lon } : null;
    const current = situationOf(draft);
    if (!draft.touched) setPlanDraft(preset(draft, initialFor ?? "go", at));
    // A different situation chosen on Home is a new intention: start it fresh rather than mixing it into the tab's plan.
    else if (initialFor && current !== initialFor) setPlanDraft(preset(newPlanDraft(new Date(), deviceZone()), initialFor, at));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derive the situation from a handed-over draft once
    else if (!initialFor) setSituation(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const update = useCallback((patch: Partial<PlanDraft>) => { if (draft) setPlanDraft({ ...draft, ...patch, touched: true, selection: undefined }); }, [draft]);
  const chooseSituation = (s: Situation) => {
    setSituation(s);
    setSelected(0);
    if (draft) setPlanDraft(preset({ ...draft, activity: "", loop: false, savedId: undefined }, s, here ? { lat: here.lat, lon: here.lon } : null));
    // Keep ?for= in step, or a refresh reads the old situation as "a new one chosen on Home" and wipes this plan (audit P13-001).
    const url = new URL(window.location.href);
    if (url.searchParams.has("for")) { url.searchParams.set("for", s); window.history.replaceState(null, "", url); }
  };

  const origin = draft ? pointOf(draft.origin) : null;
  const dest = draft && !draft.loop ? pointOf(draft.destination) : null;
  const zone = draft?.timeZone && validZone(draft.timeZone) ? draft.timeZone : deviceZone();
  const instant = draft ? instantForLocal(draft.departureLocal, zone) : null;
  const mode: Mode = draft?.mode ?? "walk";
  const loop = Boolean(draft?.loop);
  const loopMinutes = draft?.loopTarget?.kind === "duration" ? draft.loopTarget.value : 30;
  const complete = Boolean(draft && origin && (loop || dest) && instant);
  const intent = draft ? intentFromDraft({ ...draft, timeZone: zone }) : null;

  // ── Evidence ───────────────────────────────────────────────────────────────────────────────
  const wayKey = complete && !loop && origin && dest ? JSON.stringify([origin, dest, mode]) : "";
  const [ways, setWays] = useState<Ways | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!wayKey || !origin || !dest) return;
    let live = true;
    void api<WalkAnswer | ModeAnswer>("/api/geo/route", { body: { from: { lat: origin.lat, lon: origin.lon }, to: { lat: dest.lat, lon: dest.lon }, ...(mode === "walk" ? {} : { mode }), ...(osmOnly ? { source: "osm" } : {}) } }).then((r) => {
      if (!live) return;
      if (!r.ok) return setWays({ key: wayKey, ways: [], notes: "failed", error: r.code === "too_far" ? (mode === "walk" ? "That’s further than a walk Mira can follow. Try a ride or transit." : r.message) : r.network ? "You’re offline. Your plan is kept; Mira will check when you’re connected." : "Mira couldn’t check the way just now." });
      if ("mode" in r.data) {
        const m = r.data;
        setWays({ key: wayKey, notes: null, error: null, noRoute: !m.route, ways: m.route ? [{ route: m.route, lighting: null, helpPoints: m.arrivalHelp, helpEvidence: m.arrivalEvidence }] : [{ route: { meters: 0, minutes: 0, geometry: [], approximate: true }, lighting: null, helpPoints: m.arrivalHelp, helpEvidence: m.arrivalEvidence }] });
      } else {
        const w = r.data;
        setWays({ key: wayKey, notes: w.notes, error: null, ways: [{ route: w.route, lighting: w.lighting, lightingEvidence: w.lightingEvidence, helpPoints: w.helpPoints, helpEvidence: w.helpEvidence }, ...w.alternatives] });
      }
      setSelected(0);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wayKey, retry]);
  const currentWays = ways?.key === wayKey ? ways : null;

  // A run or walk loop: mapped loops only where the walking graph exists; Help Points near the start everywhere.
  const loopKey = complete && loop && origin && intent ? JSON.stringify([origin, loopMinutes, draft?.paceMinutesPerKm ?? null, draft?.departureLocal]) : "";
  const [loopPlan, setLoopPlan] = useState<{ key: string; data: PlanOptionsResult | null } | null>(null);
  const [startHelp, setStartHelp] = useState<{ key: string; points: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> } | null>(null);
  useEffect(() => {
    if (!loopKey || !intent || !origin) return;
    let live = true;
    void api<PlanOptionsResult>("/api/plan/options", { body: { intent } }).then((r) => { if (live) setLoopPlan({ key: loopKey, data: r.ok ? r.data : null }); });
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { lat: origin.lat, lon: origin.lon, ...(osmOnly ? { source: "osm" } : {}) } }).then((r) => {
      if (live) setStartHelp({ key: loopKey, points: r.ok ? r.data.helpPoints : [], evidence: r.ok ? r.data.evidence : { state: "failed", sources: [], retryable: true } });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopKey, retry]);

  // Around the place that matters: the destination (or the start of a loop).
  const focus = loop ? origin : dest;
  const focusKey = complete && focus ? `${focus.lat.toFixed(3)},${focus.lon.toFixed(3)}` : "";
  type Around = { key: string; notes: CommunityNote[] | null | "failed"; updates: { evidence: EvidenceState<SafetyUpdatesData> } | "failed" | null; country: CountryContext | null; zone?: string | null };
  const [around, setAroundState] = useState<Around | null>(null);
  const setAround = (key: string, patch: Partial<Omit<Around, "key">>) => setAroundState((a) => ({ ...(a?.key === key ? a : { key, notes: null, updates: null, country: null }), ...patch }));
  useEffect(() => {
    if (!focusKey || !focus) return;
    let live = true;
    const at = { lat: focus.lat, lon: focus.lon };
    void api<{ notes: CommunityNote[] }>("/api/community/nearby", { body: at }).then((r) => { if (live) setAround(focusKey, { notes: r.ok ? r.data.notes : "failed" }); });
    void api<{ evidence: EvidenceState<SafetyUpdatesData> }>("/api/safety-updates", { body: { ...at, window: 7 } }).then((r) => { if (live) setAround(focusKey, { updates: r.ok ? r.data : "failed" }); });
    void api<{ country: CountryContext }>("/api/geo/reverse", { body: { ...at, ...(osmOnly ? { source: "osm" } : {}) } }).then((r) => { if (live && r.ok) setAround(focusKey, { country: r.data.country }); });
    void api<{ timeZone: string | null }>("/api/geo/zone", { body: at }).then((r) => { if (live) setAround(focusKey, { zone: r.ok ? r.data.timeZone : null }); });
    return () => { live = false; };
    // `retry`: the ledger's "Try again" re-checks notes and local updates too, not only the way (audit L06-005).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, retry]);
  const aroundNow = around?.key === focusKey ? around : null;

  // Times are the place's, not the phone's (audit P05-001: a 10 PM walk in Lisbon was briefed on India time as daylight).
  // Once the place's zone is known it becomes the plan's — said plainly in When, and changeable there. A zone she
  // picked herself is never replaced.
  const countryZone = aroundNow?.zone ?? aroundNow?.country?.timezone ?? null;
  useEffect(() => {
    // A zone Mira filled in from an earlier place is not her choice: a new place replaces it (re-audit RA5: Lisbon stayed on Kolkata time).
    if (!draft || !countryZone || !validZone(countryZone) || sameClock(draft.timeZone || deviceZone(), countryZone) || (draft.timeZone && draft.timeZone !== deviceZone() && !draft.timeZoneAuto)) return;
    setPlanDraft({ ...draft, timeZone: countryZone, timeZoneAuto: true });
  }, [countryZone, draft]);
  // Zone not known, but the place is far east or west of the phone's clock: say so rather than plan on the phone's time.
  const zoneUnsure = Boolean(focus && aroundNow && aroundNow.zone === null && !countryZone && Math.abs(focus.lon / 15 - -new Date().getTimezoneOffset() / 60) > 2.5);

  // ── Derived brief ─────────────────────────────────────────────────────────────────────────
  const loopReady = loopPlan?.key === loopKey && loopPlan.data?.state === "ready" ? loopPlan.data : null;
  const wayList: WayOption[] = loop
    ? (loopReady?.options ?? []).map((o) => ({ route: { meters: o.meters, minutes: o.minutes, geometry: o.geometry, approximate: false, provider: "osm" }, lighting: null, helpPoints: [] }))
    : currentWays?.ways ?? [];
  const way = wayList[Math.min(selected, Math.max(0, wayList.length - 1))] ?? null;
  const minutes = loop ? (way?.route.minutes ?? loopMinutes) : way && !currentWays?.noRoute ? way.route.minutes : null;
  const departAt = instant && draft?.timeKind === "arrive_by" && minutes ? new Date(instant.getTime() - minutes * 60_000) : instant;
  const arriveAt = departAt && minutes ? new Date(departAt.getTime() + minutes * 60_000) : null;
  const helpAt = departAt ? localTimeInZone(departAt, zone) : null;
  const sun = origin ?? dest;
  const later = draft && origin && departAt && sun && daylightAt(departAt, sun) === "dark" ? laterDaylight(localTimeForInstant(departAt, zone), zone, sun) : null;
  const helpPointsShown: HelpPoint[] = loop ? (startHelp?.key === loopKey ? startHelp.points.slice(0, 6) : []) : way?.helpPoints ?? [];

  const claims: Claim[] = (() => {
    if (!complete || !draft) return [];
    const list: Claim[] = [];
    if (loop) {
      list.push(loopPlan?.key !== loopKey ? { id: "route", kind: "pending", topic: "Route", icon: "route", claim: "Looking for a mapped loop…" } : loopReady ? { id: "route", kind: "estimate", topic: "Route", icon: "route", claim: `${loopReady.options.length} mapped loop${loopReady.options.length === 1 ? "" : "s"} near ${loopMinutes} min at your pace`, source: "OpenStreetMap paths" } : { id: "route", kind: "none", topic: "Route", icon: "route", claim: "Mira can’t map a loop here yet — it only has a walking graph for a few areas.", source: "You can still check daylight and Help Points near your start, and go with Mira for a set time." });
      // One daylight line when start and finish agree; two only when it changes during the run.
      const endAt = departAt ? new Date(departAt.getTime() + loopMinutes * 60_000) : null;
      const same = departAt && endAt && sun ? daylightAt(departAt, sun) === daylightAt(endAt, sun) : true;
      list.push(daylightClaim(departAt, sun, zone, same ? "for the whole of it" : "when you start"));
      if (!same && endAt) list.push({ ...daylightClaim(endAt, sun, zone, "when you finish"), id: "daylight-end" });
      list.push(startHelp?.key === loopKey ? helpClaim(startHelp.points, startHelp.evidence, helpAt, "within a short walk of your start", "when you start") : helpClaim([], undefined, null));
    } else {
      if (currentWays?.error) list.push({ id: "time", kind: "failed", topic: mode === "walk" ? "Walk time" : "Travel time", icon: "clock", claim: currentWays.error });
      else if (currentWays?.noRoute) list.push({ id: "time", kind: "none", topic: "Travel time", icon: "clock", claim: "No travel time for this. You’ll set your own check-in time." });
      else list.push(walkTimeClaim(currentWays ? way : null, mode, arriveAt, zone));
      list.push(mode === "walk" ? daylightClaim(departAt, sun, zone, "when you set off") : daylightClaim(arriveAt ?? departAt, dest, zone, arriveAt ? "when you arrive" : "at that time"));
      if (mode === "walk") list.push(currentWays?.error ? { id: "lighting", kind: "none", topic: "Lighting", icon: "lamp", claim: "Not checked — the way couldn’t be found." } : lightingClaim(currentWays ? way : null));
      else list.push({ id: "lighting", kind: "none", topic: "Lighting", icon: "lamp", claim: "Checked for walks only — plan the walk from where you arrive to see it." });
      list.push(currentWays?.error ? { id: "help", kind: "none", topic: "Help Points", icon: "shield", claim: "Not checked — the way couldn’t be found." } : helpClaim(way?.helpPoints ?? [], currentWays ? way?.helpEvidence : undefined, mode === "walk" ? helpAt : arriveAt ? localTimeInZone(arriveAt, zone) : helpAt, mode === "walk" ? "on this way" : "within 500 m of where you arrive", mode === "walk" ? "when you pass" : "when you arrive"));
    }
    const notes = !loop && mode === "walk" ? currentWays?.notes ?? null : aroundNow?.notes ?? null;
    const notesRow = notesClaim(notes, !loop && mode === "walk" ? "on this way" : loop ? "near your start" : "near where you arrive");
    if (notesRow) list.push(notesRow);
    list.push(updatesClaim(aroundNow?.updates ?? null, loop ? "near your start" : "near there"));
    const c = aroundNow?.country;
    if (situation === "travel" && c) {
      const actions = emergencyActions(c);
      list.push(actions.length ? { id: "country", kind: "checked", topic: `Emergency in ${c.countryName ?? "this country"}`, icon: "phone", claim: actions.map((a) => `${a.number} ${a.label.toLowerCase()}`).join(" · "), source: `${c.emergency.source?.title ?? "Mira’s reviewed list"} · ${statusWords(c.emergency.status)}` } : { id: "country", kind: "none", topic: "Emergency number", icon: "phone", claim: `Mira hasn’t verified the emergency number for ${c.countryName ?? "this place"} yet.` });
    }
    list.push(blindSpotsClaim(loop ? "loop" : mode));
    return list;
  })();

  const take = complete ? decisionTake({ departDaylight: departAt && sun ? daylightAt(departAt, sun) : null, arriveDaylight: (arriveAt ?? (loop && departAt ? new Date(departAt.getTime() + loopMinutes * 60_000) : null)) && sun ? daylightAt(arriveAt ?? new Date(departAt!.getTime() + loopMinutes * 60_000), sun) : null, ways: wayList, selected, helpAt: mode === "walk" || loop ? helpAt : arriveAt ? localTimeInZone(arriveAt, zone) : helpAt, loop, mode, nearStart: loop && startHelp?.key === loopKey ? startHelp.points : undefined }) : [];

  // ── Actions ───────────────────────────────────────────────────────────────────────────────
  const soon = departAt && clock ? Math.abs(departAt.getTime() - clock.getTime()) <= 30 * 60_000 : false;
  const goTarget: GoTarget = {
    intent,
    mode,
    loop,
    to: !loop && dest && draft ? { name: placeName(draft.destination) ?? "Destination", lat: dest.lat, lon: dest.lon, savedPlaceId: draft.destination.resolution?.source === "saved_place" ? draft.destination.resolution.placeId : undefined } : null,
    start: draft?.origin.kind === "named" ? origin : null,
    minutes: loop ? loopMinutes : minutes,
    geometry: way && !way.route.approximate ? way.route.geometry : null,
    fastest: selected === 0,
    plannedAt: instant ? { kind: draft?.timeKind === "arrive_by" ? "arrive_by" : "depart_at", at: instant.getTime() } : null,
  };
  const save = async () => {
    if (!draft) return;
    if (!signedIn) return setSignIn(true);
    setSaveState({ busy: true, text: null });
    const body = { draft: { ...draft, timeZone: zone } };
    // A plan opened from Journeys updates its saved copy; one that was deleted meanwhile is saved anew.
    let r = draft.savedId ? await api<{ plan: { id: string } }>(`/api/me/plans/${draft.savedId}`, { method: "PATCH", body }) : null;
    const updated = Boolean(r?.ok);
    if (!r || (!r.ok && r.status === 404)) r = await api<{ plan: { id: string } }>("/api/me/plans", { body });
    if (r.ok && r.data.plan.id !== draft.savedId) setPlanDraft({ ...draft, savedId: r.data.plan.id });
    setSaveState({ busy: false, text: r.ok ? `${updated ? "Updated in" : "Saved to"} Journeys for 30 days. Nothing started and nothing shared.` : r.code === "provider_content" || r.code === "incomplete_plan" ? `${r.message} This plan stays in this tab for 2 hours.` : r.message });
  };
  // ── The way back and other legs (docs/phase2-ux/00 §1) ─────────────────────────────────────
  const setLegs = (legs: PlanLegDraft[]) => { if (draft) setPlanDraft({ ...draft, legs, touched: true, selection: undefined }); };
  const addWayBack = () => {
    if (!draft) return;
    const legs = draft.legs ?? [];
    const back = returnLegFromMain({ ...draft, timeZone: zone });
    if (back) { setLegs([...legs, back]); setLegSheet({ index: legs.length, kind: "when" }); return; }
    // Started from where you are: ask where you're coming back to.
    setLegSheet({ index: legs.length, kind: "place" });
  };
  const pickLegPlace = (p: PickedPlace) => {
    if (!draft || !legSheet || "here" in p) return;
    const legs = [...(draft.legs ?? [])];
    const to = { query: p.name, resolution: { source: p.source, name: p.name, point: { lat: p.lat, lon: p.lon }, ...(p.placeId ? { placeId: p.placeId } : {}) } };
    // A next stop continues from where the previous leg ends; a way back starts where the trip there ends.
    const prev = legSheet.kind === "stop" && legs.length ? legs[legs.length - 1].destination : null;
    const from = prev ?? { query: placeName(draft.destination) ?? draft.destination.query, resolution: draft.destination.resolution };
    const label = legSheet.kind === "stop" ? `To ${p.name}` : `Return to ${p.name}`;
    legs[legSheet.index] = { ...(legs[legSheet.index] ?? { label: "", departureLocal: "", timeZone: zone, mode: draft.mode, timeKind: "depart_at", constraints: "", destinationCountryIso: null }), label: label.slice(0, 160), origin: from, destination: to };
    setLegs(legs);
    setLegSheet({ index: legSheet.index, kind: "when" });
  };
  const checkLeg = (index: number) => {
    if (!draft) return;
    const leg = draft.legs?.[index];
    if (!leg) return;
    if (!leg.departureLocal) return setLegSheet({ index, kind: "when" });
    const swapped = activatePlanLeg(draft, index);
    // A trip there "from where you are" was for that moment; it isn't kept as a leg of its own.
    const next = swapped ?? { ...draft, touched: true, selection: undefined, activity: leg.label, origin: { kind: "named" as const, ...leg.origin }, destination: leg.destination, departureLocal: leg.departureLocal, timeZone: leg.timeZone || zone, mode: leg.mode, timeKind: leg.timeKind ?? "depart_at", legs: (draft.legs ?? []).filter((_, i) => i !== index) };
    setPlanDraft(next);
    setSelected(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const askAbout = () => { handOffAsk("What should I know about this plan?"); router.push("/mira"); };
  const pick = (field: "origin" | "destination", p: PickedPlace) => {
    if (!draft) return;
    if ("here" in p) update({ origin: { kind: "device", use: "from_here", point: { lat: p.lat, lon: p.lon } } });
    else if (field === "origin") update({ origin: { kind: "named", query: p.placeId?.startsWith("g:") && draft.origin.kind === "named" && draft.origin.query ? draft.origin.query : p.name, resolution: { source: p.source, name: p.name, point: { lat: p.lat, lon: p.lon }, ...(p.placeId ? { placeId: p.placeId } : {}) } } });
    else update({ destination: { query: p.name, resolution: { source: p.source, name: p.name, point: { lat: p.lat, lon: p.lon }, ...(p.placeId ? { placeId: p.placeId } : {}) } } });
    setSheet(null);
  };

  if (!draft) return <div className="m-screen"><p role="status" className="m-screen-inner pt-8 text-ink-muted">Opening your plan…</p></div>;

  const originLabel = placeName(draft.origin);
  const destLabel = placeName(draft.destination);
  const unresolvedOrigin = draft.origin.kind === "named" && draft.origin.query && !draft.origin.resolution;
  const unresolvedDest = !loop && draft.destination.query && !draft.destination.resolution;
  const nextQuestion = !origin ? (situation === "travel" ? "Where are you arriving?" : situation === "run" ? "Where will you start?" : "Where are you starting from?") : !loop && !dest ? (situation === "travel" ? "Where are you staying?" : "Where are you going?") : !instant ? "When?" : null;
  // A share is shown only when some of the way has lighting evidence at all; otherwise it's "not known", never 0%.
  const loopName = loopWord(draft);
  // ── Sky card facts ────────────────────────────────────────────────────────────────────────
  const checking = (!loop && !currentWays) || (loop && loopPlan?.key !== loopKey);
  const verb = loop ? loopName.toLowerCase() : mode === "walk" ? "walk" : mode === "ride" ? "ride" : "by transit";
  const tripTitle = loop ? `${loopMinutes} min ${verb}` : minutes ? `${Math.round(minutes)} min ${verb}${arriveAt ? ` · arrive ${clockIn(arriveAt, zone)}` : ""}` : currentWays?.error ? "Couldn’t check the way" : currentWays?.noRoute ? "No travel time available" : "…";
  const helpList = loop ? (startHelp?.key === loopKey ? startHelp.points : null) : currentWays ? way?.helpPoints ?? [] : null;
  const helpLocal = mode === "walk" || loop ? helpAt : arriveAt ? localTimeInZone(arriveAt, zone) : helpAt;
  const openThen = helpList ? helpList.filter((p) => { const h = hoursState(p, helpLocal ?? undefined); return h.kind === "open_24h" || h.kind === "listed_open" || h.kind === "open_now"; }).length : 0;
  const litShare = way?.lighting ? (() => { const l = way.lighting.summary; return l.lit + l.poles + l.dark > 0 ? `${l.lit + l.poles}%` : null; })() : null;
  const planNotes = !loop && mode === "walk" ? currentWays?.notes ?? null : aroundNow?.notes ?? null;
  // Released notes count only when there are some (publishing is off in this beta; never an always-0 stat).
  const noteCount = Array.isArray(planNotes) ? planNotes.length : 0;
  const planStats: LiveStat[] = [
    // A failed check reads as failed, not "0/0" or a spinner that never ends (audit L06-006).
    { label: loop ? "Help Points open near your start" : mode === "walk" ? "Help Points open on the way" : "Help Points open where you arrive", value: currentWays?.error ? "—" : helpList ? `${openThen}/${helpList.length}` : "…", state: currentWays?.error ? "failed" : helpList ? "ok" : "loading" },
    ...(mode === "walk" && !loop ? [{ label: "mapped as lit", value: litShare ?? "—", state: (currentWays ? (litShare ? "ok" : "none") : "loading") as LiveStat["state"] }] : []),
    ...(noteCount ? [{ label: noteCount === 1 ? "note from people" : "notes from people", value: String(noteCount), state: "ok" as const }] : []),
  ];

  const lit = (w: WayOption) => { const l = w.lighting?.summary; return l && l.lit + l.poles + l.dark > 0 ? l.lit + l.poles : null; };

  return (
    <div className="m-screen bg-companion pb-[calc(var(--tabbar-space)+7rem)]">
      <div className="m-screen-inner">
        <header className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Back" className="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line"><Icon name="back" className="size-5" /></button>
          <SafetyAccess emailAlerts={emailAlerts} compact />
        </header>

        <div className="m-scroll-x -mx-4 mt-5 px-4" role="radiogroup" aria-label="What are you doing?">
          {SITUATIONS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={situation === s.id} onClick={() => chooseSituation(s.id)} className={cx("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1", situation === s.id ? "bg-ink text-canvas ring-ink" : "bg-surface text-ink-muted ring-line")}>
              <Icon name={s.icon} className="size-4" />{s.label}
            </button>
          ))}
        </div>

        <h1 className="m-display mt-5">{complete ? planTitle(draft) : situation === "run" ? "Plan a run or walk" : situation === "travel" ? "Plan your arrival" : "Where are you going?"}</h1>
        {complete ? <p className="mt-1 text-[0.95rem] text-ink-muted">From {draft.origin.kind === "device" ? "where you are" : originLabel} · {whenWords(draft.departureLocal, zone)}{!sameClock(zone, deviceZone()) ? ` (${zone.split("/").pop()?.replace(/_/g, " ")} time)` : ""}</p> : null}

        {/* The few questions that change the answer; once answered they fold into one line so the brief leads. */}
        {complete && !editing ? (
          <section aria-label="Your plan" className="m-card mt-4 flex items-center gap-2 p-1.5 pl-3">
            <div className="m-scroll-x min-w-0 flex-1 py-1">
              {[
                { label: loop ? `From ${originLabel}` : `${originLabel} → ${destLabel}`, icon: "route", on: () => setSheet(loop ? "origin" : "destination") },
                { label: whenWords(draft.departureLocal, zone), icon: "clock", on: () => setSheet("when") },
                { label: loop ? `${loopMinutes} min ${loopName.toLowerCase()}` : MODES.find((m) => m.id === mode)?.label ?? "Walk", icon: loop ? "walk" : mode === "walk" ? "walk" : mode === "ride" ? "transit" : "bus", on: () => setEditing(true) },
              ].map((c) => (
                <button key={c.label} type="button" onClick={c.on} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-sunken px-3 text-[0.8125rem] font-semibold"><Icon name={c.icon} className="size-4 text-ink-muted" />{c.label}</button>
              ))}
            </div>
            <button type="button" onClick={() => setEditing(true)} className="min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-accent-strong">Edit</button>
          </section>
        ) : (
        <section aria-label="Your plan" className="m-card mt-5 divide-y divide-line overflow-hidden">
          <QuestionRow label={situation === "travel" ? "Arriving at" : situation === "run" ? "Start" : "From"} icon={draft.origin.kind === "device" ? "locate" : "pin"} value={originLabel && !unresolvedOrigin ? originLabel : null} placeholder={situation === "travel" ? "Airport, station…" : "Where you are, or a place"} hint={unresolvedOrigin ? `Which “${draft.origin.kind === "named" ? draft.origin.query : ""}” did you mean? Tap to choose.` : null} state={unresolvedOrigin ? "needs" : "idle"} onClick={() => setSheet("origin")} />
          {loop ? (
            <div className="px-4 py-3">
              <p className="m-label">How long</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="How long">
                {LENGTHS.map((m) => <button key={m} type="button" role="radio" aria-checked={loopMinutes === m} onClick={() => update({ loopTarget: { kind: "duration", value: m } })} className={cx("min-h-10 rounded-full px-3.5 text-sm font-semibold ring-1", loopMinutes === m ? "bg-accent text-accent-ink ring-accent" : "bg-surface ring-line-strong")}>{m} min</button>)}
              </div>
              <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Run or walk">
                {[["Run", 6], ["Walk", 13.3]].map(([label, pace]) => <button key={label} type="button" role="radio" aria-checked={loopName === label} onClick={() => update({ activity: String(label), paceMinutesPerKm: Number(pace) })} className={cx("min-h-10 rounded-full px-3.5 text-sm font-semibold ring-1", draft.activity === label ? "bg-ink text-canvas ring-ink" : "bg-surface ring-line")}>{label}</button>)}
              </div>
            </div>
          ) : (
            <QuestionRow label={situation === "travel" ? "Staying at" : "To"} icon="pin" value={destLabel && !unresolvedDest ? destLabel : null} placeholder={situation === "travel" ? "Hotel, home, address…" : "Search a place"} hint={unresolvedDest ? `Which “${draft.destination.query}” did you mean? Tap to choose.` : null} state={unresolvedDest ? "needs" : "idle"} onClick={() => setSheet("destination")} />
          )}
          <QuestionRow label={situation === "travel" ? "Landing / arriving" : draft.timeKind === "arrive_by" ? "Arrive by" : "When"} icon="clock" value={instant ? whenWords(draft.departureLocal, zone) : null} placeholder="Choose a time" hint={draft.timeHint && !instant ? `You said ${draft.timeHint} — choose the day` : !instant && clockChangeAt(draft.departureLocal, zone) === "repeated" ? "Clocks go back then, so that time happens twice. Choose a time a little before or after." : !instant && clockChangeAt(draft.departureLocal, zone) === "skipped" ? "Clocks go forward then, so that time doesn't exist. Choose a time a little later." : zoneUnsure ? `Times are in your phone’s zone (${zone.replace(/_/g, " ")}). This place may be in a different one — set it here.` : !sameClock(zone, deviceZone()) ? `${zone.replace(/_/g, " ")} time` : null} state={draft.timeHint && !instant ? "needs" : "idle"} onClick={() => setSheet("when")} />
          {!loop ? (
            <div className="px-4 py-3">
              <p className="m-label">How</p>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-sunken p-1" role="radiogroup" aria-label="How are you going?">
                {MODES.map((m) => <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => update({ mode: m.id })} className={cx("min-h-10 rounded-xl text-sm font-semibold", mode === m.id ? "bg-surface shadow-[var(--shadow-float)]" : "text-ink-muted")}>{m.label}</button>)}
              </div>
            </div>
          ) : null}
          {complete ? <button type="button" onClick={() => setEditing(false)} className="flex min-h-12 w-full items-center justify-center text-sm font-semibold text-accent-strong">Done — show the brief</button> : null}
        </section>
        )}

        {!complete ? (
          <MiraVoice className="mt-5" state="observing">
            {nextQuestion ?? "Choose your places and time."} <span className="text-ink-muted">Then I’ll check daylight, {situation === "run" ? "Help Points near your start" : "lighting and Help Points on the way"}, and local updates for that time — and tell you what I can’t see.</span>
          </MiraVoice>
        ) : (
          <>
            {/* Mira's take, then the options, then the ledger. Conclusion → choice → evidence. */}
            <section aria-label="Mira’s take" className="mt-5">
              {/* The plan's own sky: coloured by the sky when she sets off, with the facts for that time. */}
              <SkyCard
                state={skyAt(departAt, sun)}
                label="Your plan, at that time"
                pulse={checking ? "thinking" : "noticed"}
                eyebrow={checking ? "Checking that place at that time…" : "Your plan, at that time"}
                aside={whenWords(draft.departureLocal, zone)}
                title={tripTitle}
                strip={departAt && sun ? { from: departAt, point: sun, hours: loop ? 3 : 6, startLabel: "set off" } : null}
                stats={planStats}
                line={checking ? null : take.length ? take.join(" ") : "Here’s what I could check."}
              />
              {later ? (
                <button type="button" onClick={() => update({ departureLocal: later.local, timeKind: "depart_at" })} className="m-card m-press mt-3 flex w-full items-center gap-3 p-3.5 text-left">
                  <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-dusk-soft text-dusk"><Icon name="sun" className="size-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold">Daylight from about {whenWords(later.local, zone).replace(/^(Today|Tomorrow), /, "")}</span><span className="block text-[0.8125rem] text-ink-muted">{later.minutesLater} min later · compare that time instead</span></span>
                  <Icon name="chevron" className="size-4 text-ink-subtle" />
                </button>
              ) : null}
            </section>

            {(way && !way.route.approximate && way.route.geometry.length > 1) || origin ? (
              <BriefMap className="mt-4 h-52" tiles={tiles} start={origin} end={loop ? null : dest} route={way && way.route.geometry.length > 1 && !way.route.approximate ? way.route.geometry : null} lighting={way?.lighting?.segments ?? null} pins={helpPointsShown.filter((p) => !osmOnly || !p.id.startsWith("g:")).slice(0, 6).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: HELP_ICON[p.cls] ?? "pin", strong: HELP_CLASSES[p.cls].emergency }))} label={loop ? "Your start and Help Points nearby" : "The chosen way, with lit stretches and Help Points"} />
            ) : null}

            {wayList.length > 1 ? (
              <section aria-label="Ways to compare" className="mt-4">
                <h2 className="m-label">{loop ? "Mapped loops" : "Ways to compare"}</h2>
                <div className="m-scroll-x -mx-4 mt-2 px-4 pb-1">
                  {wayList.map((w, i) => (
                    <button key={i} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)} className={cx("m-press min-w-[11.5rem] shrink-0 rounded-[var(--radius-tile)] p-3.5 text-left", selected === i ? "bg-accent-soft ring-2 ring-accent" : "bg-surface ring-1 ring-line")}>
                      <span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{loop ? `Loop ${i + 1}` : i === 0 ? "Fastest" : `Way ${i + 1}`}</span>{selected === i ? <Icon name="check" className="size-4 text-accent" /> : null}</span>
                      <span className="mt-1 block text-2xl font-semibold tabular-nums">{Math.round(w.route.minutes)}<span className="text-sm font-normal text-ink-muted"> min · {(w.route.meters / 1000).toFixed(1)} km</span></span>
                      <span className="mt-2 grid gap-1">
                        {!loop ? <EvidenceChip kind={lit(w) === null ? "nodata" : "checked"}>{lit(w) === null ? "Lighting not known" : `${lit(w)}% mapped as lit`}</EvidenceChip> : null}
                        {!loop ? <EvidenceChip kind={w.helpEvidence?.state === "failed" ? "failed" : "checked"}>{w.helpEvidence?.state === "failed" ? "Help Points not checked" : `${w.helpPoints.length} Help Point${w.helpPoints.length === 1 ? "" : "s"}`}</EvidenceChip> : <EvidenceChip kind="estimate">at your pace</EvidenceChip>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <EvidenceLedger className="mt-4" items={claims.map((c): EvidenceItem => ({ ...c, ...(c.kind === "failed" ? { action: { label: "Try again", onClick: () => setRetry((n) => n + 1) } } : {}) }))} title={loop ? "Your start, at that time" : "That way, at that time"} label="What Mira checked" />

            {saveState.text ? <StateNote className="mt-3">{saveState.text}</StateNote> : null}

            {!loop ? (
              <RowList label={!(draft.legs ?? []).length ? "After this" : (draft.legs ?? []).every((l) => /^return\b/i.test(l.label)) ? "The way back" : /^return\b/i.test(draft.activity) ? "The way there" : "Also in this plan"} id="legs-h" className="mt-6">
                {(draft.legs ?? []).map((leg, i) => {
                  const to = leg.destination.resolution?.name ?? leg.destination.query;
                  const back = /^return\b/i.test(leg.label);
                  return <Row key={i} icon="route" tone={back ? "dusk" : "accent"} eyebrow={leg.departureLocal ? whenWords(leg.departureLocal, leg.timeZone || zone) : "Choose a time"} title={back ? `Back to ${to}` : `To ${to}`} detail={leg.departureLocal ? "Check this way, at that time" : "Mira checks it again for the time you choose"} onClick={() => checkLeg(i)} ariaLabel={`${back ? "Way back" : "Leg"}: ${to}`} trailing={<RowAction icon="trash" label={back ? "Remove the way back" : "Remove this leg"} onClick={() => setLegs((draft.legs ?? []).filter((_, j) => j !== i))} />} />;
                })}
                {!(draft.legs ?? []).some((l) => /^return\b/i.test(l.label)) && !/^return\b/i.test(draft.activity) && (draft.legs ?? []).length < 2 ? (
                  <Row icon="plus" tone="ink" title="Add the way back" detail={draft.origin.kind === "named" && originLabel ? `Back to ${originLabel} — you choose when` : "Choose where you’re coming back to"} onClick={addWayBack} />
                ) : null}
                {(draft.legs ?? []).length < 2 && !/^return\b/i.test(draft.activity) ? (
                  <Row icon="route" tone="ink" title="Add another stop" detail="Another place after this one — each leg is checked for its own time" onClick={() => setLegSheet({ index: (draft.legs ?? []).length, kind: "stop" })} />
                ) : null}
              </RowList>
            ) : null}
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-x-5 text-sm">
          <button type="button" onClick={() => { clearPlanDraft(); ensurePlanDraft(); const d = newPlanDraft(new Date(), deviceZone()); setPlanDraft(preset(d, situation, currentLocation().point ? { lat: currentLocation().point!.lat, lon: currentLocation().point!.lon } : null)); setSelected(0); setSaveState({ busy: false, text: null }); }} className="inline-flex min-h-11 items-center font-semibold text-ink-muted">Clear plan</button>
        </div>
        <p className="mt-1 text-xs text-ink-subtle">This plan stays in this tab for 2 hours after your last change. Saving and sharing are always your choice.</p>
      </div>

      {complete ? (
        <ActionBar>
          {soon ? (
            <button type="button" onClick={() => setSheet("go")} className="mira-primary min-h-13 flex-1 text-base"><Icon name="footsteps" className="size-5" />Go with Mira</button>
          ) : (
            <button type="button" onClick={() => void save()} disabled={saveState.busy} className="mira-primary min-h-13 flex-1 text-base">{saveState.busy ? "Saving…" : signedIn ? "Save this plan" : "Sign in to save"}</button>
          )}
          <button type="button" onClick={askAbout} aria-label="Ask Mira about this plan" className="grid size-13 shrink-0 place-items-center rounded-2xl bg-surface ring-1 ring-line-strong"><Icon name="sparkle" className="size-5 text-accent" /></button>
          {soon ? <button type="button" onClick={() => void save()} disabled={saveState.busy} aria-label="Save this plan" className="grid size-13 shrink-0 place-items-center rounded-2xl bg-surface ring-1 ring-line-strong"><Icon name="star" className="size-5" /></button> : <button type="button" onClick={() => setSheet("go")} className="min-h-13 shrink-0 rounded-2xl bg-surface px-4 text-sm font-semibold ring-1 ring-line-strong">Go now</button>}
        </ActionBar>
      ) : null}

      <PlaceSheet open={sheet === "origin"} onClose={() => setSheet(null)} title={situation === "travel" ? "Where are you arriving?" : "Starting from"} onPick={(p) => pick("origin", p)} saved={places} near={here ? { lat: here.lat, lon: here.lon } : null} allowHere osmOnly={osmOnly} />
      <PlaceSheet open={sheet === "destination"} onClose={() => setSheet(null)} title={situation === "travel" ? "Where are you staying?" : "Where to?"} onPick={(p) => pick("destination", p)} saved={places} near={origin ?? (here ? { lat: here.lat, lon: here.lon } : null)} allowHere={false} osmOnly={osmOnly} />
      <WhenSheet open={sheet === "when"} onClose={() => setSheet(null)} local={draft.departureLocal} zone={zone} timeKind={draft.timeKind ?? "depart_at"} allowArrive={!loop} quick={situation} deviceZone={deviceZone()} onChange={(p) => update({ ...(p.local ? { departureLocal: p.local, timeHint: null } : {}), ...(!draft.timeZone ? { timeZone: zone } : {}), ...(p.zone && validZone(p.zone) ? { timeZone: p.zone, timeZoneAuto: false } : {}), ...(p.timeKind ? { timeKind: p.timeKind } : {}) })} />
      <PlaceSheet open={legSheet?.kind === "place" || legSheet?.kind === "stop"} onClose={() => setLegSheet(null)} title={legSheet?.kind === "stop" ? "Next stop" : "Coming back to"} onPick={pickLegPlace} saved={places} near={dest ?? (here ? { lat: here.lat, lon: here.lon } : null)} allowHere={false} osmOnly={osmOnly} />
      <WhenSheet open={legSheet?.kind === "when"} onClose={() => setLegSheet(null)} local={draft.legs?.[legSheet?.index ?? -1]?.departureLocal ?? ""} zone={draft.legs?.[legSheet?.index ?? -1]?.timeZone || zone} timeKind={draft.legs?.[legSheet?.index ?? -1]?.timeKind ?? "depart_at"} allowArrive quick="go" deviceZone={deviceZone()} title={/^return\b/i.test(draft.legs?.[legSheet?.index ?? -1]?.label ?? "") ? "When are you heading back?" : "When does this leg start?"} after={instant} onChange={(p) => { const i = legSheet?.index ?? -1; const legs = [...(draft.legs ?? [])]; if (!legs[i]) return; legs[i] = { ...legs[i], ...(p.local ? { departureLocal: p.local, timeHint: null } : {}), ...(p.zone && validZone(p.zone) ? { timeZone: p.zone } : !legs[i].timeZone ? { timeZone: zone } : {}), ...(p.timeKind ? { timeKind: p.timeKind } : {}) }; setLegs(legs); }} />
      <GoSheet open={sheet === "go"} onClose={() => setSheet(null)} target={goTarget} signedIn={signedIn} emailAlerts={emailAlerts} onSignIn={() => { setSheet(null); setSignIn(true); }} />
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to save plans and go with Mira" />
      <TimeZoneChoices />
    </div>
  );
}
