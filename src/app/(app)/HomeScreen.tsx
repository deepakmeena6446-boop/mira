"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/map/WorldMap";
import { BottomSheet, type Snap } from "@/components/app/BottomSheet";
import { Avatar } from "@/components/app/Avatar";
import { Chip } from "@/components/app/Chip";
import { SignInSheet } from "@/components/app/SignInSheet";
import { SearchOverlay, type Destination } from "@/components/app/SearchOverlay";
import { HELP_ICON, kindIcon } from "@/components/app/kinds";
import { LightingSummary, lightingEvidenceLine, lightingWhy, sourceDetails } from "@/components/app/LightingSummary";
import { HelpPointList } from "@/components/app/HelpPointList";
import { ArrivalContextLines, RouteOptions, type RouteOption } from "@/components/app/RouteOptions";
import { TRAVEL_MODES, TRAVEL_MODE_INFO, distanceUnits, expectedMinutes, formatDistance, formatMinutes, type TravelMode } from "@/domain/travel-mode";
import { HelpCluster } from "@/components/app/HelpCluster";
import { MiraLine } from "@/components/app/MiraLine";
import { JourneyCapsule } from "@/components/app/JourneyCapsule";
import { homeLine, routeLine } from "@/domain/mira-line";
import { SEEN_SCOUT_KEY, SEEN_VERIFIED_KEY, journeysStarted, readNumber, recordUsage, usageMode, writeValue, type UsageMode } from "@/lib/usage-signal";
import type { ImpactView } from "@/server/contributions";
import type { CheckView } from "@/server/contributions/checks";
import { useChromeTop } from "@/lib/use-chrome-top";
import { useWide } from "@/lib/use-wide";
import { haptic } from "@/lib/haptics";
import { UnsafeSheet, type UnsafeShareAction, type UnsafeTellAction } from "@/components/app/UnsafeSheet";
import { HelpNearSheet } from "@/components/app/HelpNearSheet";
import { HELP_CLASSES, dedupeHelpPoints, type HelpClass, type HelpPoint } from "@/domain/help-points";
import type { EvidenceState } from "@/domain/evidence-state";
import { setCountry, useCountry, type CountryContext } from "@/lib/locale-store";
import { InstallCard } from "@/components/pwa/InstallCard";
import { useFlag } from "@/lib/flags";
import { useOverlay } from "@/lib/use-overlay";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import { SafetyUpdatesSection } from "@/components/app/SafetyUpdates";
import { shareLiveLink } from "@/lib/share";
import { keepTripRoute } from "@/lib/trip-route";
import { suggestionQuery, tripStartExtras } from "@/lib/trip-start";
import type { HabitSuggestion } from "@/domain/habits";
import { clearPendingDestination, greetingFor, peekPendingDestination, setArea, setPendingReportSpot, shouldAutoLocate, useClock, useLocation, watchWhileVisible, type PickedSpot } from "@/lib/location-store";
import type { SavedPlace } from "@/server/account/places";
import type { Contact } from "@/server/account/contacts";
import type { TripView } from "@/server/trips";
import { hasPlanWork, intentFromDraft, resolvedDestination, resolvedOrigin } from "@/domain/plan-state";
import { setPlanDraft, usePlanDraft, usePlanHydrated } from "@/lib/plan-store";
import { PlanOptions } from "@/components/app/PlanOptions";
import { instantForLocal, type PlanOption } from "@/domain/plan-options";
import { loopCheckInEligibility, planStartEligibility } from "@/domain/plan-journey";
import { requestLocation } from "@/lib/location-store";

interface Place {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distanceM?: number;
  hours?: string | null;
}
interface Note {
  id: string;
  text: string;
  polarity: string;
  timeBand: string;
  week?: string;
  lat: number;
  lon: number;
}
type Mode = TravelMode;
/** Her own "when do you expect to get there?" choices, when there's no provider time (or she prefers hers). */
const ETA_CHOICES = [10, 20, 30, 45, 60, 90, 120, 180];
interface RouteInfo extends RouteOption {
  notes: Note[];
  alternatives: RouteOption[];
}
/** Ride / transit (see /api/geo/route): the provider's route, or null = not known; Help Points where she arrives. */
interface ModeInfo {
  mode: Exclude<Mode, "walk">;
  route: (RouteOption["route"] & { provider: string }) | null;
  arrivalHelp: HelpPoint[];
  arrivalEvidence?: EvidenceState<HelpPoint[]>;
}
type Routed = { data: RouteInfo | ModeInfo | null; code?: string };

/** The greeting card + help row on top, the sheet below: frame the map in what is visible between. */
const MAP_PADDING = { top: 170, bottom: 360, left: 40, right: 40 };
/** Desktop: the side panel (rail 88 + panel 400) covers the left of the map. */
const MAP_PADDING_WIDE = { top: 40, bottom: 40, left: 88 + 400 + 40, right: 60 };
const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const SECONDARY = "flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-line bg-surface px-2 text-center text-[0.82rem] font-medium text-ink hover:bg-sunken";
const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

export function HomeScreen({
  user,
  places: initialPlaces,
  contacts,
  trip,
  tiles,
  emailAlerts,
}: {
  user: { id: string; name: string; avatarUrl: string | null; helpExclude?: string[] } | null;
  places: SavedPlace[];
  contacts: Contact[];
  trip: TripView | null;
  tiles: { url: string; attribution: string; styleUrl?: string | null; nightStyleUrl?: string | null; nightUrl?: string | null };
  /** Whether Mira can email trusted contacts at all (production SMTP configured). */
  emailAlerts: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  // Honour the explicit first-open location choice on the map too.
  const loc = useLocation(false);
  const shouldRequestLocation = !loc.point;
  const requestLocationAgain = loc.request;
  const lat = loc.point?.lat;
  const lon = loc.point?.lon;
  const me = useMemo(() => (lat !== undefined && lon !== undefined ? { lat, lon } : null), [lat, lon]);
  const now = useClock();
  const planDraft = usePlanDraft();
  const planHydrated = usePlanHydrated();
  const planActive = hasPlanWork(planDraft);
  useEffect(() => { if (planHydrated && !planActive && shouldRequestLocation && shouldAutoLocate()) void requestLocationAgain(); }, [planHydrated, planActive, shouldRequestLocation, requestLocationAgain]);
  const plan = planDraft ? intentFromDraft(planDraft) : null;
  const planOrigin = plan ? resolvedOrigin(plan) : null;
  const planDestination: Destination | null = plan ? resolvedDestination(plan) : null;
  const planRouteKey = plan && planOrigin && planDestination ? JSON.stringify({ from: planOrigin, to: { lat: planDestination.lat, lon: planDestination.lon }, departure: plan.departure, mode: plan.mode }) : "";
  const [planGeometry, setPlanGeometry] = useState<[number, number][] | null>(null);
  const [planChoice, setPlanChoice] = useState<{ key: string; option: PlanOption } | null>(null);
  const chosenPlanOption = planChoice?.key === planRouteKey ? planChoice.option : null;
  const choosePlan = useCallback((option: PlanOption | null, key: string) => setPlanChoice(option ? { key, option } : null), []);
  const [confirmPlanStart, setConfirmPlanStart] = useState<string | null>(null);
  const [loopEtaMinutes, setLoopEtaMinutes] = useState(30);
  const [initialDest] = useState(() => peekPendingDestination());
  useEffect(() => { if (initialDest) clearPendingDestination(initialDest); }, [initialDest]);
  const [poiArea, setPoiArea] = useState<string | null>(null);
  const installDismissed = useFlag("mira.installDismissed");
  const [pressed, setPressed] = useState<PickedSpot | null>(null);
  // The card opens under the finger: ignore taps briefly so lifting it isn't a "ghost" tap.
  const [pressArmed, setPressArmed] = useState(false);
  const closePressed = useCallback(() => setPressed(null), []);
  useOverlay(pressed !== null, closePressed);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) return;
    void api<{ notifications: Array<{ read_at: string | null }> }>("/api/me/notifications").then((r) => r.ok && setUnread(r.data.notifications.filter((n) => !n.read_at).length));
  }, [user]);
  const [nearby, setNearby] = useState<{ places: Place[]; notes: Note[] }>({ places: [], notes: [] });
  const [nearbyFailed, setNearbyFailed] = useState(false);
  const [nearHelp, setNearHelp] = useState<{ key: string; points: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> | null; failed: boolean } | null>(null);
  const [helpRetry, setHelpRetry] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [places, setPlaces] = useState(initialPlaces);
  const [pickedDest, setDest] = useState<Destination | null>(initialDest);
  const dest = planActive ? planDestination : pickedDest;
  // Route answers per travel mode for the destination on screen (switching modes back is instant).
  const [routed, setRouted] = useState<{ base: string; byMode: Partial<Record<Mode, Routed>> } | null>(null);
  const [option, setOption] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [snap, setSnap] = useState<Snap>(initialDest ? "half" : "peek");
  const [signIn, setSignIn] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const [nearOpen, setNearOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode>("walk");
  const mode = plan?.mode ?? selectedMode;
  const [etaMin, setEtaMin] = useState(30);
  // With a provider ride/transit time, Mira proposes the ETA; she can set her own instead.
  const [ownTime, setOwnTime] = useState(false);
  const countryIso = useCountry().iso;
  const units = distanceUnits(countryIso);
  const exclude = useMemo(() => (user?.helpExclude ?? []) as HelpClass[], [user?.helpExclude]);
  const accepted = contacts.filter((c) => c.status === "accepted" && c.isDefault);
  const [shareWithCircle, setShareWithCircle] = useState(false);
  // "Like usual" — only when her own finished journeys back it up (>= 3 to this saved place around this hour).
  const [habit, setHabit] = useState<HabitSuggestion | null>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  useChromeTop(chromeRef);
  const wide = useWide();

  // First visit: show the short onboarding once (per-device convenience flag only).
  useEffect(() => {
    if (user || !planHydrated || planActive) return;
    try {
      if (!localStorage.getItem("mira.welcomed")) router.replace("/welcome");
    } catch {
      /* storage unavailable: stay on home */
    }
  }, [user, router, planHydrated, planActive]);

  // Keep the dot live while Home is on screen (paused when the app is hidden).
  const located = loc.status === "ok";
  useEffect(() => (planHydrated && located && !planActive ? watchWhileVisible() : undefined), [planHydrated, located, planActive]);
  // Locality from the map tiles ("Kamla Nagar"), else the nearest named place we know.
  const area = loc.area ?? poiArea;

  // Where am I, what's around, and the Help Points near me (fetched ahead, so "I feel unsafe" is instant).
  const meKey = me ? `${me.lat.toFixed(3)},${me.lon.toFixed(3)}` : "";
  useEffect(() => {
    if (!planHydrated || !me || planActive) return;
    let stop = false;
    (async () => {
      const nearbyReq = api<{ places: Place[]; notes: Note[] }>("/api/geo/nearby", { body: me });
      const r = await api<{ label: string | null; country?: CountryContext }>("/api/geo/reverse", { body: me });
      // Help Points after the country is known: it turns on locale-weighted classes (24-hour convenience stores in Japan).
      const iso = (r.ok ? r.data.country?.iso : null) ?? countryIso;
      const [n, h] = await Promise.all([nearbyReq, api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { ...me, ...(iso ? { country: iso } : {}) } })]);
      if (stop) return;
      if (r.ok) {
        setPoiArea(r.data.label);
        setCountry(r.data.country); // emergency numbers + helplines for the country she is in
      }
      if (n.ok) setNearby(n.data);
      setNearbyFailed(!n.ok);
      setNearHelp({ key: meKey, points: h.ok ? h.data.helpPoints : [], evidence: h.ok ? h.data.evidence : null, failed: !h.ok || h.data.evidence.state === "failed" });
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey, helpRetry, planHydrated, planActive]);

  const pick = useCallback((d: Destination) => {
    setSearchOpen(false);
    setPinMode(false);
    setDest(d);
    if (planActive && planDraft) setPlanDraft({ ...planDraft, loop: false, destination: { query: d.name, resolution: { source: d.resolutionSource ?? "selected_point", point: { lat: d.lat, lon: d.lon }, name: d.name } } });
    setOption(0);
    if (!planActive) setSelectedMode("walk");
    setOwnTime(false);
    setSnap("half");
  }, [planActive, planDraft]);

  // A named plan origin is separate from current GPS. Never substitute "near me" on lookup failure.
  const routeFrom = planActive ? planOrigin : me;
  const routeBase = planHydrated && !planActive && dest && routeFrom ? `${dest.lat},${dest.lon}|${meKey}` : null;
  const byMode = useMemo(() => (routed && routed.base === routeBase ? routed.byMode : {}), [routed, routeBase]);
  const haveMode = Boolean(byMode[mode]);
  useEffect(() => {
    if (!routeBase || !dest || !routeFrom || haveMode) return;
    let stop = false;
    const want = mode;
    void api<RouteInfo | ModeInfo>("/api/geo/route", { body: { from: routeFrom, to: { lat: dest.lat, lon: dest.lon }, ...(want === "walk" ? {} : { mode: want }) } }).then((res) => {
      if (stop) return;
      const answer: Routed = { data: res.ok ? res.data : null, code: res.ok ? undefined : res.code };
      setRouted((prev) => ({ base: routeBase, byMode: { ...(prev?.base === routeBase ? prev.byMode : {}), [want]: answer } }));
      if (!plan && want === "walk" && !res.ok && res.code === "too_far") setSelectedMode("ride"); // legacy map: too far to walk
    });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeBase, mode, haveMode]);
  const info = (byMode.walk?.data as RouteInfo | null | undefined) ?? null;
  const walkTooFar = byMode.walk?.code === "too_far";
  const routeLoading = Boolean(routeBase) && !haveMode;
  const modeRes = mode === "walk" ? undefined : byMode[mode];
  const modeInfo = (modeRes?.data as ModeInfo | null | undefined) ?? null;
  const rideRoute = modeInfo?.route ?? null;
  const manualEta = mode !== "walk" && (!rideRoute || ownTime);
  // Ride / transit ETA: the provider's time with a little slack, unless she set her own (clamped to what a journey accepts).
  const tripEta = rideRoute && !manualEta ? expectedMinutes(rideRoute.minutes) : etaMin;
  // Her Help Point filters apply everywhere (e.g. no police), before any count or list.
  const options: RouteOption[] = useMemo(
    () =>
      (info ? [{ route: info.route, lighting: info.lighting, lightingEvidence: info.lightingEvidence, helpPoints: info.helpPoints ?? [], helpEvidence: info.helpEvidence }, ...(info.alternatives ?? [])] : []).map((o) => ({ ...o, helpPoints: o.helpPoints.filter((p) => !exclude.includes(p.cls)) })),
    [info, exclude],
  );
  const chosen = options[Math.min(option, options.length - 1)] ?? null;
  // Home's walk summary: the conclusion first (docs/launch-ux/06 §3.4); the evidence stays below.
  const likeLast = habit && dest && places.some((p) => p.id === habit.placeId && p.lat === dest.lat && p.lon === dest.lon) && habit.shareWith.length ? names(habit.shareWith.map((c) => c.name)) : null;
  const walkLine = routeLine({
    loading: routeLoading,
    minutes: chosen?.route.minutes ?? null,
    approximate: Boolean(chosen?.route.approximate),
    arriveAt: !planActive && chosen && now ? clock(new Date(now.getTime() + chosen.route.minutes * 60_000)) : null,
    failed: !routeLoading && !chosen && Boolean(byMode.walk),
    tooFar: walkTooFar,
    lighting: chosen?.lighting ?? null,
    lightingEvidence: chosen?.lightingEvidence,
    helpCount: chosen?.helpPoints.length ?? 0,
    helpFirstMinutes: chosen?.helpPoints[0] ? Math.round((chosen.helpPoints[0].alongM ?? 0) / 75) : null,
    helpState: chosen?.helpEvidence?.state,
    likeLastTime: !planActive && shareWithCircle && user ? likeLast : null,
  });
  const arrivalHelp = useMemo(() => (modeInfo?.arrivalHelp ?? []).filter((p) => !exclude.includes(p.cls)), [modeInfo, exclude]);

  // Pins: what's around you; once a destination is picked, the Help Points along the walk (or where she arrives).
  const mapPlaces = useMemo(
    () =>
      dest
        ? (mode === "walk" ? (chosen?.helpPoints ?? []) : arrivalHelp).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: HELP_ICON[p.cls] ?? "pin", strong: HELP_CLASSES[p.cls].emergency }))
        : nearby.places.slice(0, 8).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: kindIcon(p.kind) })),
    [dest, mode, chosen, arrivalHelp, nearby.places],
  );
  const onPlaceClick = useCallback(
    (p: { name: string; lat: number; lon: number; id: string }) => {
      const hit = nearby.places.find((x) => x.id === p.id);
      const help = chosen?.helpPoints.find((x) => x.id === p.id) ?? arrivalHelp.find((x) => x.id === p.id);
      pick({ name: p.name, lat: p.lat, lon: p.lon, kind: hit?.kind ?? (help ? HELP_CLASSES[help.cls].label : undefined) });
    },
    [nearby.places, chosen, arrivalHelp, pick],
  );

  // Long-press on the map: offer to report or walk to that exact spot.
  const onLongPress = useCallback(async (p: { lat: number; lon: number }) => {
    setPressed({ ...p, name: null });
    setPressArmed(false);
    // Arm the card only once the finger has lifted (plus the browser's delayed synthetic click),
    // so lifting it can't "ghost tap" whatever button opened under it. Fallback for mouse/right-click.
    let armed = false;
    const arm = (delay: number) => {
      if (armed) return;
      armed = true;
      window.removeEventListener("touchend", onLift);
      window.removeEventListener("pointerup", onLift);
      setTimeout(() => setPressArmed(true), delay);
    };
    const onLift = () => arm(450);
    window.addEventListener("touchend", onLift, { once: true });
    window.addEventListener("pointerup", onLift, { once: true });
    setTimeout(() => arm(0), 1500);
    const r = await api<{ label: string | null }>("/api/geo/reverse", { body: p });
    setPressed((cur) => (cur && cur.lat === p.lat && cur.lon === p.lon ? { ...cur, name: r.ok ? r.data.label : null } : cur));
  }, []);

  const onMapClick = useCallback(
    async (p: { lat: number; lon: number }) => {
      if (!pinMode) return;
      const r = await api<{ label: string | null }>("/api/geo/reverse", { body: p });
      void pick({ name: (r.ok && r.data.label) || "Dropped pin", lat: p.lat, lon: p.lon });
    },
    [pinMode, pick],
  );

  const home = places.find((p) => /home|hostel|pg/i.test(p.label));
  const g = now ? greetingFor(now) : null;
  const firstName = user?.name.split(" ")[0];
  const activeTrip = trip && (trip.state === "active" || trip.state === "missed") ? trip : null;
  const invited = contacts.filter((c) => c.status === "invited");
  // Her Circle for a journey: accepted email contacts Mira emails (when email is on), and contacts she sends her link on WhatsApp.
  const emailed = emailAlerts ? accepted : [];
  const onWhatsApp = contacts.filter((c) => c.phone && c.isDefault);
  const circle = [...new Map([...emailed, ...onWhatsApp].map((c) => [c.id, c])).values()];
  const sharesWithCircle = Boolean(user && circle.length && shareWithCircle);
  /** Who follows this journey and how, in her words — WhatsApp is a tap she makes; email is an attempt Mira makes. */
  const circleStartLine = () =>
    [
      onWhatsApp.length ? `After you start, send ${names(onWhatsApp.map((c) => c.name))} your live link on WhatsApp in one tap: your latest spot and ETA, until you arrive.` : null,
      emailed.length ? `Mira attempts to email ${names(emailed.map((c) => c.name))} a live link when this journey starts, and an alert if you miss your check-in. Sending can fail.` : "Nobody is alerted automatically if you don't arrive.",
    ]
      .filter(Boolean)
      .join(" ");

  /** Start a journey (her tap, always). `to` defaults to the destination on screen. */
  const startTrip = async (to?: { name: string; lat: number; lon: number }) => {
    if (planActive) return toast("This is a planned route. Edit or clear the plan before starting a live journey.", "error");
    if (!user) return setSignIn("Sign in to start with Mira");
    const target = to ?? dest;
    if (!target || !me || starting) return;
    const picked = !to && option > 0 ? chosen : null;
    setStarting(true);
    const walking = to || mode === "walk";
    // A habit is only ever learned from a journey to one of her saved places (and only on arrival).
    const saved = places.find((p) => p.lat === target.lat && p.lon === target.lon);
    const res = await api<{ trip: TripView }>("/api/trips", {
      body: {
        from: me,
        to: { lat: target.lat, lon: target.lon, name: target.name.slice(0, 80) },
        share: sharesWithCircle,
        ...(walking ? (picked ? { routeMinutes: picked.route.minutes } : {}) : { mode, etaMinutes: tripEta }),
        ...tripStartExtras(saved?.id),
      },
    });
    setStarting(false);
    if (res.ok) {
      recordUsage("journey");
      haptic("journey-start");
      const line = (to || !walking ? null : chosen?.route.geometry) ?? null;
      if (line && line.length > 2) keepTripRoute(res.data.trip.id, line);
      router.push("/trip");
      router.refresh();
    } else if (res.code === "trip_active") {
      toast(trip ? `You already have a journey to ${trip.destination.name} running — here it is.` : "You already have a journey running — here it is.");
      router.push("/trip");
    } else {
      toast(res.message, "error");
    }
  };

  const startChosenPlan = async () => {
    if (!plan || !chosenPlanOption || starting) return;
    if (!user) return setSignIn("Sign in to start with Mira");
    const target = resolvedDestination(plan);
    if (!target) return;
    const planned = instantForLocal(plan.departure.local, plan.departure.timeZone);
    if (!planned || Math.abs(planned.getTime() - Date.now()) > 30 * 60_000) return toast("Edit the plan's departure to now before starting.", "error");
    setStarting(true);
    const fix = await requestLocation();
    const eligibility = planStartEligibility(plan, chosenPlanOption, fix.status === "ok" && fix.point ? { ...fix.point, at: fix.at } : null, Date.now());
    if (!eligibility.ok) { setStarting(false); return toast(eligibility.reason, "error"); }
    const result = await api<{ trip: TripView }>("/api/trips", { body: {
      from: { lat: fix.point!.lat, lon: fix.point!.lon },
      to: { lat: target.lat, lon: target.lon, name: target.name.slice(0, 80) },
      routeMinutes: Math.max(1, Math.round(chosenPlanOption.minutes)),
      share: sharesWithCircle,
    } });
    setStarting(false);
    if (result.ok) {
      keepTripRoute(result.data.trip.id, chosenPlanOption.geometry);
      recordUsage("journey");
      haptic("journey-start");
      router.push("/trip");
      router.refresh();
    } else if (result.code === "trip_active") {
      router.push("/trip");
    } else toast(result.message, "error");
  };

  const startLoopCheckIn = async () => {
    if (!plan?.loop || starting) return;
    if (!user) return setSignIn("Sign in to start with Mira");
    setStarting(true);
    const fix = await requestLocation();
    const eligibility = loopCheckInEligibility(plan, fix.status === "ok" && fix.point ? { ...fix.point, at: fix.at } : null, Date.now());
    if (!eligibility.ok) { setStarting(false); return toast(eligibility.reason, "error"); }
    const result = await api<{ trip: TripView }>("/api/trips", { body: {
      from: { lat: fix.point!.lat, lon: fix.point!.lon },
      mode: "walk",
      etaMinutes: loopEtaMinutes,
      tz: plan.departure.timeZone,
      share: sharesWithCircle,
    } });
    setStarting(false);
    if (result.ok) {
      recordUsage("journey");
      haptic("journey-start");
      router.push("/trip");
      router.refresh();
    } else if (result.code === "trip_active") router.push("/trip");
    else toast(result.message, "error");
  };

  const savePlace = async (label: string, emoji: string) => {
    if (!user) return setSignIn("Sign in to save places");
    if (!dest || saving) return;
    setSaving(label);
    const res = await api<{ place: SavedPlace }>("/api/me/places", { body: { label, emoji, lat: dest.lat, lon: dest.lon, address: dest.name.slice(0, 160) } });
    setSaving(null);
    if (res.ok) {
      // Saving an existing label (e.g. "Home" again) moves it, so replace rather than append.
      setPlaces((p) => [...p.filter((x) => x.id !== res.data.place.id), res.data.place]);
      toast(`Saved as ${label}`);
    } else toast(res.message, "error");
  };

  // "I feel unsafe": the share action depends on what's already known — never asks for anything Mira has.
  const unsafeShare: UnsafeShareAction = activeTrip?.shareUrl
    ? {
        label: "Send my live link",
        detail: `Anyone you send it to sees you until you arrive at ${activeTrip.destination.name}.`,
        onShare: async () => {
          const r = await shareLiveLink(activeTrip.shareUrl!, activeTrip.destination.name);
          if (r === "copied") toast("Live link copied — paste it in WhatsApp or a message.");
          if (r === "failed") toast("Couldn't share the link on this device.", "error");
        },
      }
    : !user
      ? { label: "Share my journey live", detail: "Sign in, then send a live link to anyone.", onShare: () => (setUnsafe(false), setSignIn("Sign in to start with Mira")) }
      : dest || home
        ? {
            label: `Share my journey to ${dest ? dest.name : home!.label}`,
            detail: "Starts a live journey now. Then send the link to anyone you choose.",
            onShare: () => {
              setUnsafe(false);
              void startTrip(dest ? undefined : { name: home!.label, lat: home!.lat, lon: home!.lon });
            },
          }
        : me
          ? {
              // No destination to ask for in this moment: share where she is, now, and send the link from the journey screen.
              label: "Share where I am, live",
              detail: "Starts sharing your location now. Then send the link to anyone you choose; it stops when you say you're okay.",
              onShare: async () => {
                setUnsafe(false);
                const r = await api<{ trip: TripView }>("/api/trips", { body: { from: me, share: sharesWithCircle, etaMinutes: 30 } });
                if (r.ok) recordUsage("journey");
                if (r.ok || r.code === "trip_active") {
                  router.push("/trip");
                  router.refresh();
                } else toast(r.message, "error");
              },
            }
          : { label: "Share my journey live", detail: "Turn on location, then send a live link to anyone.", onShare: () => (setUnsafe(false), void loc.request()) };
  // "Tell my people now": emails her accepted contacts at once. With no journey running, it first
  // starts one that just shares where she is (no destination), so they have a live link to open.
  const tellAction: UnsafeTellAction | null =
    user && circle.length && me
      ? {
          names: circle.map((c) => c.name),
          email: emailed.length > 0,
          onTell: async () => {
            let tripId = activeTrip?.id ?? null;
            if (!tripId) {
              const r = await api<{ trip: TripView }>("/api/trips", { body: { from: me, share: true, etaMinutes: 30 } });
              if (!r.ok && r.code !== "trip_active") return { error: r.message };
              tripId = r.ok ? r.data.trip.id : null;
              if (!tripId) {
                const cur = await api<{ trip: TripView | null }>("/api/trips/current");
                tripId = cur.ok ? (cur.data.trip?.id ?? null) : null;
              }
            }
            if (!tripId) return { error: "Couldn't start sharing right now. Send your live link or call them." };
            const t = await api<{ told: string[]; failed: string[]; whatsapp: Array<{ name: string; url: string }> }>(`/api/trips/${tripId}/checkon`, { body: {} });
            router.refresh();
            return t.ok ? t.data : { error: t.message };
          },
        }
      : null;
  const unsafeHelp = useMemo(() => dedupeHelpPoints([...(chosen?.helpPoints ?? []), ...(nearHelp?.points ?? [])]), [chosen, nearHelp]);

  // One sentence, and only what's true: who follows, and whether anyone is alerted.
  const circleLine = !user ? (
    <>When you start, you can send a live link to anyone you choose.</>
  ) : circle.length ? (
    <>
      <Icon name="check" className="mr-1 inline size-4 text-mint" />
      {circleStartLine()}
    </>
  ) : !emailAlerts ? (
    <>
      Send a live link when you start, or{" "}
      <Link href="/circle" className="font-semibold text-accent-strong">
        add someone&apos;s WhatsApp
      </Link>{" "}
      to send it in one tap. Nobody is alerted automatically.
    </>
  ) : invited.length ? (
    <>Waiting for {names(invited.map((c) => c.name))} to accept your invite; until then, send a live link yourself.</>
  ) : (
    <>
      Send a live link when you start, or{" "}
      <Link href="/circle" className="font-semibold text-accent-strong">
        add someone
      </Link>{" "}
      to send it on WhatsApp in one tap (with their email, Mira can also attempt an alert if you don&apos;t arrive).
    </>
  );

  // "Like usual" — only when her own finished journeys back it up (>= 3 to this saved place around this hour).
  const activeId = activeTrip?.id;
  useEffect(() => {
    if (!user || activeId) return;
    let stop = false;
    void api<{ suggestion: HabitSuggestion | null }>(`/api/me/habits/suggestion${suggestionQuery()}`).then((r) => !stop && r.ok && setHabit(r.data.suggestion));
    return () => {
      stop = true;
    };
  }, [user, activeId]);

  // Contribution context for the Mira line (signed in only, once per visit, after first paint): a
  // ready MIRA Check, newly confirmed answers, Mira Scout. Failure changes nothing on screen.
  const [contrib, setContrib] = useState<{ checks: CheckView[]; impact: ImpactView } | null>(null);
  useEffect(() => {
    if (!user) return;
    let stop = false;
    const t = setTimeout(() => void api<{ checks: CheckView[]; impact: ImpactView }>("/api/contribute").then((r) => !stop && r.ok && setContrib(r.data)), 400);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [user]);
  // Device-local, day-stable usage mode (docs/launch-ux/07 §B) — read after mount (storage is client-only).
  const [usage, setUsage] = useState<{ mode: UsageMode; journeys: number; seenVerified: number | null; seenScout: boolean }>({ mode: "cold", journeys: 0, seenVerified: null, seenScout: false });
  useEffect(() => {
    // Device storage exists only after mount; reading it once here keeps the server render stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsage({ mode: usageMode(), journeys: journeysStarted(), seenVerified: readNumber(SEEN_VERIFIED_KEY), seenScout: readNumber(SEEN_SCOUT_KEY) === 1 });
  }, []);
  const verified = contrib?.impact.summary.verified ?? 0;
  const hasMe = me !== null;
  const steward = Boolean(contrib?.impact.steward.steward);
  const line = useMemo(() => {
    const usual = habit ? places.find((p) => p.id === habit.placeId) : undefined;
    return homeLine({
      signedIn: Boolean(user),
      greeting: g ? `${g.hello}${firstName ? `, ${firstName}` : ""}` : "Hello",
      firstName: firstName ?? null,
      late: Boolean(g?.late),
      night: Boolean(g?.late),
      hasLocation: hasMe,
      habit: habit && usual ? { placeLabel: usual.label, mode: habit.mode, times: habit.times } : null,
      home: home ? { label: home.label } : null,
      readyCheck: contrib?.checks[0]?.placeName ?? null,
      // The first time this phone sees her impact it just records it: only a later rise is "new".
      newlyVerified: usage.seenVerified !== null && verified > usage.seenVerified,
      scoutNew: steward && !usage.seenScout,
      circleCount: circle.length,
      journeysStarted: usage.journeys,
      usage: usage.mode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, g?.late, g?.hello, firstName, hasMe, habit, places, home, contrib, usage, verified, steward, circle.length]);
  // Seen flags: a confirmation or Scout moment is said once per phone, then remembered as seen.
  useEffect(() => {
    if (!contrib) return;
    if (usage.seenVerified === null || line.key !== "verified") writeValue(SEEN_VERIFIED_KEY, String(verified));
    if (steward && line.key !== "scout") writeValue(SEEN_SCOUT_KEY, "1");
  }, [contrib, line.key, usage.seenVerified, verified, steward]);
  const onLineAction = () => {
    const a = line.action?.kind;
    if (a === "go-habit" && habit) {
      const usual = places.find((p) => p.id === habit.placeId);
      if (usual) pick({ name: usual.label, lat: usual.lat, lon: usual.lon });
    } else if (a === "take-home" && home) pick({ name: home.label, lat: home.lat, lon: home.lon });
    else if (a === "answer-check") router.push("/contribute#checks");
    else if (a === "see-impact") {
      writeValue(SEEN_VERIFIED_KEY, String(verified));
      router.push("/contribute#impact");
    } else if (a === "scout") {
      writeValue(SEEN_SCOUT_KEY, "1");
      router.push("/contribute#impact");
    } else if (a === "find-home") setSearchOpen(true);
    else if (a === "add-circle") router.push("/circle");
  };
  // Help near me · Report · Ask Mira — all always present; a contributor sees Report first.
  const secondary = usage.mode === "contribute" ? (["report", "help", "ask"] as const) : (["help", "report", "ask"] as const);
  // One line of who follows; the full, careful explanation is one tap away ("How sharing works").
  const circleShort = !user
    ? "When you start, you can send a live link to anyone you choose."
    : circle.length
      ? `${names(circle.map((c) => c.name))} can follow when you share.`
      : "Only people you send your link to can follow.";

  return (
    <div className="fixed inset-0 overflow-hidden">
      <h1 className="sr-only">Mira — where are you going?</h1>
      <WorldMap tiles={tiles} me={planHydrated && !planActive ? me : null} dest={plan?.loop && planOrigin ? planOrigin : dest} route={planActive ? planGeometry : mode === "walk" ? (chosen?.route.approximate ? null : chosen?.route.geometry ?? null) : (rideRoute?.geometry ?? null)} notes={[]} places={planActive ? [] : mapPlaces} recenter={recenter} lighting={planActive ? null : mode === "walk" ? (chosen?.lighting?.segments ?? null) : null} onPlaceClick={onPlaceClick} onLongPress={onLongPress} onMapClick={onMapClick} onArea={setArea} label={planActive ? "Map for your plan" : "Map around your location"} padding={wide ? MAP_PADDING_WIDE : MAP_PADDING} />
      {planActive ? <div className="pointer-events-none absolute inset-x-4 top-24 z-20 mx-auto max-w-xl"><div className="pointer-events-auto rounded-[var(--radius-card)] border border-line bg-surface/95 p-3 text-sm shadow-[var(--shadow-card)]"><p className="font-semibold">{plan ? `${plan.activity} · ${plan.origin.kind === "device" ? "From here" : plan.origin.query}${plan.loop ? " · loop" : ` → ${plan.destination?.query}`}` : "Your plan is still being entered"}</p><p className="text-xs text-ink-muted">{plan ? `${plan.departure.local} (${plan.departure.timeZone}) · ` : ""}Current map data only; planned-time service is not checked.</p><Link href="/plan" className="inline-flex min-h-11 items-center font-semibold text-accent-strong">Edit plan</Link></div></div> : null}

      {/* Top: greeting, and help that's always one tap away */}
      <div className="mira-chrome pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto max-w-xl">
          <div ref={chromeRef}>
          <div className="glass flex items-center gap-3 rounded-[var(--radius-card)] border border-glass-edge px-4 py-2.5 shadow-[var(--shadow-float)]">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[clamp(1rem,4.6vw,1.125rem)] font-semibold leading-tight">
                {g ? `${g.hello}${firstName ? `, ${firstName}` : ""}` : " "}
              </p>
              <p className="truncate text-sm text-ink-muted">
                {now ? clock(now) : ""}
                {area ? ` · ${area}` : loc.status === "asking" ? " · Finding you…" : loc.status === "denied" ? " · Location off" : ""}
              </p>
            </div>
            {user ? (
              <>
                <Link href="/inbox" aria-label={unread ? `Updates, ${unread} new` : "Updates"} className="relative grid size-11 place-items-center rounded-full bg-sunken text-ink">
                  <Icon name="bell" className="size-5" />
                  {unread ? <span aria-hidden className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-ink">{unread > 9 ? "9+" : unread}</span> : null}
                </Link>
                <Link href="/me" aria-label="Your profile">
                  <Avatar name={user.name} src={user.avatarUrl} size={44} />
                </Link>
              </>
            ) : (
              <button type="button" onClick={() => setSignIn("Let's get you set up")} className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink">
                Sign in
              </button>
            )}
          </div>
          <div className="mt-2">
            <HelpCluster onUnsafe={() => setUnsafe(true)} />
          </div>
          </div>
          {loc.status === "denied" || loc.status === "unavailable" ? (
            <button type="button" onClick={() => loc.request()} className="mt-2 w-full rounded-2xl bg-warm-soft px-4 py-2.5 text-left text-sm font-semibold text-warm">
              {loc.status === "denied"
                ? "Location is off for Mira, so it can't show the way from here or Help Points near you. Allow it in your browser's site settings (the icon next to the address), then tap here. Search still works."
                : "Can't find you right now → Tap to try again"}
            </button>
          ) : null}
          {pinMode ? (
            <div className="pointer-events-auto mt-2 flex items-center gap-2 rounded-2xl bg-ink py-1.5 pl-4 pr-1.5 text-sm font-semibold text-canvas">
              <span className="flex-1">Tap the map to choose a spot</span>
              <button type="button" onClick={() => setPinMode(false)} className="min-h-11 rounded-xl px-3 font-semibold underline">
                Cancel
              </button>
            </div>
          ) : null}
          {pressed ? (
            <div role="dialog" aria-label="This spot" className={cx("mt-2.5 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-float)] animate-rise", pressArmed ? "pointer-events-auto" : "pointer-events-none")}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink"><Icon name="pin" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{pressed.name ?? "This spot"}</p>
                  <p className="text-sm text-ink-muted">What would you like to do here?</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setPressed(null)} className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken">
                  <Icon name="close" className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingReportSpot(pressed);
                    router.push("/report?from=map");
                  }}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-line-strong bg-surface px-3 text-sm font-semibold text-ink"
                >
                  <Icon name="flag" className="size-4" /> Report here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pick({ name: pressed.name ?? "Dropped pin", lat: pressed.lat, lon: pressed.lon });
                    setPressed(null);
                  }}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-line-strong bg-surface px-3 text-sm font-semibold text-ink"
                >
                  <Icon name="route" className="size-4" /> Go here
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {me && !planActive ? (
        <button
          type="button"
          aria-label="Centre on my location"
          onClick={() => {
            setRecenter((n) => n + 1); // fly back to you, even if the fix hasn't changed
            void loc.request();
          }}
          className="mira-locate absolute right-4 z-10 grid size-12 place-items-center rounded-full bg-surface text-accent shadow-[var(--shadow-float)]"
          style={{ bottom: `calc(${snap === "peek" ? "var(--sheet-peek)" : "var(--sheet-half)"} + var(--tabbar-space) + 1rem)`, visibility: snap === "full" ? "hidden" : undefined }}
        >
          <Icon name="locate" />
        </button>
      ) : null}

      <BottomSheet snap={snap} onSnap={setSnap} label={dest ? `Route to ${dest.name}` : "Where are you going?"}>
        {activeTrip ? (
          <div className="mb-4">
            <JourneyCapsule
              attention={activeTrip.state === "missed"}
              title={activeTrip.state === "missed" ? "Are you okay?" : `On your way to ${activeTrip.destination.name}`}
              detail={`${now ? `ETA ${clock(new Date(activeTrip.etaAt))} · ` : ""}${activeTrip.sharedWith.some((c) => c.notified) ? `${activeTrip.sharedWith.filter((c) => c.notified).map((c) => c.name).join(", ")} can follow` : "Only people you send the link to can follow"}`}
            />
          </div>
        ) : null}

        {planActive && plan?.loop && plan.mode === "walk" && planOrigin ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Loop from {plan.origin.kind === "named" ? plan.origin.query : "here"}</h2>
            <PlanOptions plan={plan} />
            <p className="text-sm text-ink-muted">No loop route or walking time is verified. Choose your own check-in time; this journey will not detect when you return.</p>
            <label className="block text-sm font-semibold">Check in after<select value={loopEtaMinutes} onChange={(e) => { setLoopEtaMinutes(Number(e.target.value)); setConfirmPlanStart(null); }} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3">{ETA_CHOICES.filter((minutes) => minutes <= 180).map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
            {activeTrip ? <Link href="/trip" className="inline-flex min-h-11 items-center text-accent-strong underline">Open active journey</Link> : confirmPlanStart === "loop" ? <div className="rounded-lg border border-line p-3"><p className="text-sm">Start a manual check-in-only loop now? Mira will request a fresh position and check that you are near the planned origin. No route or automatic arrival is available. {sharesWithCircle ? `Mira will attempt to notify ${names(circle.map((c) => c.name))}.` : "Nobody in your Circle will be notified. You can send a live link yourself."}</p><div className="mt-2 flex gap-2"><Button variant="primary" onClick={() => void startLoopCheckIn()} busy={starting} busyLabel="Checking location…">Confirm loop check-in</Button><Button variant="secondary" onClick={() => setConfirmPlanStart(null)}>Cancel</Button></div></div> : <Button variant="primary" size="lg" onClick={() => setConfirmPlanStart("loop")}><Icon name="walk" /> Start manual loop check-in</Button>}
            {user && circle.length ? <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who follows this journey">{[[true, `Share with ${names(circle.map((c) => c.name))}`], [false, "Just me"]].map(([value, label]) => <button key={String(value)} type="button" role="radio" aria-checked={shareWithCircle === value} onClick={() => setShareWithCircle(value as boolean)} className={cx("min-h-11 rounded-full border-2 px-3 text-sm font-semibold", shareWithCircle === value ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-muted")}>{label as string}</button>)}</div> : null}
            <p className="text-xs text-ink-muted">{!user ? "Sign in is needed to start a live check-in; planning stays available without it." : sharesWithCircle ? circleStartLine() : "Nobody is alerted automatically. You can choose to send a live link after starting."}</p>
          </div>
        ) : dest ? (
          <div className="animate-rise">
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink"><Icon name={kindIcon(dest.kind ?? "")} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-snug text-mixed">{dest.name}</h2>
                {mode !== "walk" ? (
                  routeLoading ? (
                    <p className="text-ink-muted">Finding the time {TRAVEL_MODE_INFO[mode].by}…</p>
                  ) : rideRoute && !manualEta ? (
                    <p className="text-ink-muted">
                      <strong className="text-ink">{formatMinutes(rideRoute.minutes)}</strong> {TRAVEL_MODE_INFO[mode].by} · {formatDistance(rideRoute.meters, units)}
                      {!planActive && now ? ` · arrive around ${clock(new Date(now.getTime() + rideRoute.minutes * 60_000))}` : ""}
                    </p>
                  ) : (
                    <p className="text-ink-muted">
                      <strong className="text-ink">{TRAVEL_MODE_INFO[mode].label}</strong>{planActive ? " · travel time unavailable for this plan" : ` · expected in ${formatMinutes(etaMin)}`}
                    </p>
                  )
                ) : chosen ? (
                  <p className="text-sm text-ink-muted">
                    Walking · {formatDistance(chosen.route.meters, units)}
                    {chosen.route.approximate ? " · approx." : ""}
                  </p>
                ) : !routeFrom ? (
                  <p className="text-ink-muted">{planActive ? "Resolve your named origin in the plan to check this way." : "Turn on location to see the way from here."}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setDest(null);
                  if (planActive && planDraft) setPlanDraft({ ...planDraft, destination: { ...planDraft.destination, resolution: null } });
                  setSnap("peek");
                }}
                className="grid size-11 place-items-center rounded-full bg-sunken"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-[var(--radius-control)] bg-sunken p-1" role="radiogroup" aria-label="How are you going?">
              {TRAVEL_MODES.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { if (planActive && planDraft) setPlanDraft({ ...planDraft, mode: m }); else setSelectedMode(m); }} className={cx("min-h-10 rounded-[calc(var(--radius-control)-4px)] text-sm font-medium transition-colors duration-150", mode === m ? "bg-surface text-ink shadow-[var(--shadow-float)]" : "text-ink-muted")}>
                  {TRAVEL_MODE_INFO[m].label}
                </button>
              ))}
            </div>

            {/* What's known about getting there (short, facts only), then the way to start, then the details. */}
            {planActive && plan ? <div className="mt-3"><PlanOptions plan={plan} onRoute={setPlanGeometry} onChoice={choosePlan} /></div> : mode === "walk" ? (
              routeFrom ? (
                <>
                  <MiraLine line={walkLine} className="mt-3" />
                  {!routeLoading && options.length > 1 ? <RouteOptions options={options} selected={option} onSelect={setOption} /> : null}
                </>
              ) : null
            ) : routeLoading ? null : (
              <div className="mt-3">
                {walkTooFar ? <p className="text-xs text-ink-subtle">Too far to walk from here, so Mira switched to {TRAVEL_MODE_INFO.ride.label}.</p> : null}
                {planActive ? <p className="text-xs text-ink-muted">{rideRoute ? "This is a current route estimate only." : "No provider travel time is available."} The planned departure time has not been checked against provider service.</p> : manualEta ? (
                  <>
                    {rideRoute ? null : (
                      <p className="text-sm text-ink-muted">
                        {!routeFrom
                          ? planActive ? "Resolve your named origin in the plan to check a route." : "Turn on location to see the time from here."
                          : modeRes?.code === "too_far"
                          ? "That's further than a journey Mira can follow (up to 4 hours)."
                          : mode === "ride"
                            ? "The driving time from here is not known."
                            : "Transit times are not known for this journey."}
                      </p>
                    )}
                    <p className="mt-2 text-sm font-semibold">When do you expect to get there?</p>
                    <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Expected in">
                      {ETA_CHOICES.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={etaMin === m} onClick={() => setEtaMin(m)} className={cx("min-h-11 rounded-full border-2 px-4 text-sm font-semibold", etaMin === m ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-muted")}>
                          {formatMinutes(m)}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">
                      Mira uses the time you choose{now ? ` (around ${clock(new Date(now.getTime() + etaMin * 60_000))})` : ""}.{" "}
                      {rideRoute ? (
                        <button type="button" onClick={() => setOwnTime(false)} className="min-h-6 font-semibold text-accent-strong">
                          Use the estimate instead
                        </button>
                      ) : null}
                    </p>
                  </>
                ) : rideRoute ? (
                  <p className="text-xs text-ink-muted">
                    Mira expects you by {now ? clock(new Date(now.getTime() + tripEta * 60_000)) : `${formatMinutes(tripEta)} from now`}, with a little extra time for {mode === "ride" ? "traffic" : "waiting and changes"}.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEtaMin(ETA_CHOICES.find((c) => c >= tripEta) ?? ETA_CHOICES[ETA_CHOICES.length - 1]);
                        setOwnTime(true);
                      }}
                      className="min-h-6 font-semibold text-accent-strong"
                    >
                      Set my own time
                    </button>
                  </p>
                ) : null}
                {mode === "transit" && rideRoute?.provider === "google" ? <p className="mt-1 text-xs text-ink-subtle">Transit times from Google; check the operator for service changes.</p> : null}
                {dest ? <ArrivalContextLines mode={mode} arrivalHelp={arrivalHelp} arrivalEvidence={modeInfo?.arrivalEvidence} dest={dest} /> : null}
              </div>
            )}

            {mode === "walk" && chosen && !chosen.route.approximate ? (
              // The one place the walk's lighting is drawn (the line above states it in words): before Start, never below it.
              <section className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2.5" aria-label="Lighting evidence before starting">
                {chosen.lighting ? (
                  <LightingSummary lighting={chosen.lighting} compact />
                ) : (
                  <>
                    <h3 className="text-[13px] font-medium text-ink-subtle">Lighting on the way</h3>
                    <p className="mt-1 text-sm text-ink-muted">{lightingEvidenceLine(chosen.lightingEvidence, chosen.lighting)}</p>
                  </>
                )}
                <details className="mt-1 text-sm text-ink-muted">
                  <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-accent-strong">Sources and freshness</summary>
                  {lightingWhy(chosen.lighting, chosen.lightingEvidence) ? <p className="mb-1.5">{lightingWhy(chosen.lighting, chosen.lightingEvidence)}</p> : null}
                  <p>
                    {sourceDetails(chosen.lightingEvidence, chosen.lighting)}
                    {chosen.lighting?.freshness?.osmFrom && new Date().getFullYear() - chosen.lighting.freshness.osmFrom >= 5 ? " Some of this map data is over five years old." : ""} Lights can be out or new ones missing — this is about lighting, not a safety rating.
                  </p>
                </details>
              </section>
            ) : null}
            <div className="mt-3">
              {planActive ? plan?.mode === "walk" && chosenPlanOption ? confirmPlanStart === planRouteKey ? <div className="rounded-lg border border-line p-3"><p className="text-sm">Start this walking journey now from your current position? Mira will check that you are near the planned origin. {sharesWithCircle ? `Mira will attempt to notify ${names(circle.map((c) => c.name))}.` : "Nobody in your Circle will be notified. You can send a live link yourself."}</p><div className="mt-2 flex gap-2"><Button variant="primary" onClick={() => void startChosenPlan()} busy={starting} busyLabel="Checking location…">Confirm start</Button><Button variant="secondary" onClick={() => setConfirmPlanStart(null)}>Cancel</Button></div></div> : <Button variant="primary" size="lg" onClick={() => setConfirmPlanStart(planRouteKey)}><Icon name="walk" /> Start chosen walk</Button> : <p className="text-sm text-ink-muted">Choose a mapped walking option before starting. Future plans can start when you are at the origin and ready to go.</p> : <Button variant="primary" size="lg" onClick={() => void startTrip()} busy={starting} busyLabel="Starting…" disabled={!me || (mode !== "walk" && routeLoading)}><Icon name={mode === "walk" ? "walk" : "route"} /> Go with Mira</Button>}
              {user && circle.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who follows this journey">
                  {[
                    [true, `Share with ${names(circle.map((c) => c.name))}`],
                    [false, "Just me"],
                  ].map(([v, label]) => (
                    <button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={shareWithCircle === v}
                      onClick={() => setShareWithCircle(v as boolean)}
                      className={cx("min-h-11 truncate rounded-full border-2 px-3 text-sm font-semibold", shareWithCircle === v ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-muted")}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
              ) : null}
              {/* Who follows and whether anyone is alerted: stated before she starts, never implied. */}
              <p className="mt-2 text-center text-xs text-ink-muted">
                {!user
                  ? "You'll sign in first. Then send a live link to anyone: they see your latest spot and ETA, no account needed, and it stops when you arrive."
                  : sharesWithCircle
                    ? circleStartLine()
                    : circle.length
                      ? "Nobody is alerted if you don't arrive. You can still send your live link on the next screen."
                      : "Nobody is alerted automatically. On the next screen, send your live link by message: they see your latest spot and ETA until you arrive."}
              </p>
            </div>

            {mode === "walk" && chosen && !chosen.route.approximate ? (
              <HelpPointList points={chosen.helpPoints} evidence={chosen.helpEvidence} defaultOpen onPick={(p) => pick({ name: p.name, lat: p.lat, lon: p.lon, kind: HELP_CLASSES[p.cls].label })} />
            ) : null}
            {mode === "walk" && info?.notes.length ? (
              <section className="mt-5">
                <h3 className="text-[13px] font-medium text-ink-subtle">Community notes on this route</h3>
                <ul className="mt-2 space-y-2">
                  {info.notes.map((n) => (
                    <li key={n.id} className="rounded-2xl bg-sunken px-4 py-3 text-sm">
                      <p>{n.text}</p>
                      <details className="mt-1 text-xs text-ink-muted">
                        <summary className="min-h-8 cursor-pointer font-semibold">{n.week ? `Week of ${new Date(n.week).toLocaleDateString([], { day: "numeric", month: "short" })} · ` : ""}Why am I seeing this?</summary>
                        <p className="mt-1">At least five different people privately reported something similar in this ~1 km area at this time of day. It&apos;s shown in fixed words, without counts or exact places, and disappears after five weeks. It isn&apos;t a rating of the area.</p>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <SafetyUpdatesSection point={{ lat: dest.lat, lon: dest.lon }} heading="Safety updates near there" />
            <section className="mt-5">
              <h3 className="text-[13px] font-medium text-ink-subtle">Save this place</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip disabled={saving !== null} onClick={() => savePlace("Home", "🏠")}>🏠 Home</Chip>
                <Chip disabled={saving !== null} onClick={() => savePlace("College", "🎓")}>🎓 College</Chip>
                <Chip disabled={saving !== null} onClick={() => savePlace("Work", "💼")}>💼 Work</Chip>
                <Chip disabled={saving !== null} onClick={() => savePlace(dest.name.slice(0, 40), "⭐")}>⭐ Favourite</Chip>
              </div>
            </section>
          </div>
        ) : (
          <div>
            {activeTrip ? null : <MiraLine line={line} primary={line.action?.kind === "go-habit" || line.action?.kind === "take-home"} onAction={onLineAction} className="mb-5" />}
            <h2 className="text-[1.3rem] font-semibold tracking-tight">Where are you going?</h2>
            <button type="button" onClick={() => setSearchOpen(true)} className="mt-3 flex min-h-13 w-full items-center gap-3 rounded-[var(--radius-control)] border border-line bg-sunken px-4 text-left text-[1.05rem] text-ink-subtle">
              <Icon name="search" className="size-5 text-ink-muted" /> Search a place or address
            </button>
            {places.length ? (
              <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
                {places.map((p) => (
                  <Chip key={p.id} onClick={() => pick({ name: p.label, lat: p.lat, lon: p.lon })}>
                    {p.emoji} {p.label}
                  </Chip>
                ))}
                <Chip onClick={() => setSearchOpen(true)} ariaLabel="Add a place">
                  <Icon name="plus" className="size-4" /> Add
                </Chip>
              </div>
            ) : null}
            {/* Who follows and whether anyone is alerted: with a Circle, the full truth stays visible (never implied);
                without one, one short line and the details a tap away. */}
            <div className="mt-3 text-sm text-ink-muted">
              {user && circle.length ? (
                <p>{circleLine}</p>
              ) : (
                <>
                  <p>{circleShort}</p>
                  {user ? (
                    <details className="mt-0.5">
                      <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-ink-subtle">How sharing works</summary>
                      <p>{circleLine}</p>
                    </details>
                  ) : null}
                </>
              )}
            </div>

            {/* Help, report, ask: always all three (report is a stable anchor); only their order adapts. */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {secondary.map((a) =>
                a === "help" ? (
                  <button key={a} type="button" onClick={() => setNearOpen(true)} aria-label="Help Points near me" className={SECONDARY}>
                    <Icon name="pin" className="size-5 text-accent" /> Help near me
                  </button>
                ) : a === "report" ? (
                  <Link key={a} href="/report?from=home" className={SECONDARY}>
                    <Icon name="flag" className="size-5 text-accent" /> Report
                  </Link>
                ) : (
                  <Link key={a} href="/mira" className={SECONDARY}>
                    <Icon name="sparkle" className="size-5 text-accent" /> Ask Mira
                  </Link>
                ),
              )}
            </div>

            {user && !installDismissed.value ? <InstallCard variant="card" onDismiss={installDismissed.set} /> : null}

            <section className="mt-5" aria-label="Around you">
              <h2 className="text-[13px] font-medium text-ink-subtle">Around you</h2>
              {!me ? (
                <p className="mt-2 text-ink-muted">{loc.status === "asking" ? "Finding where you are…" : "Turn on location to see what's nearby."}</p>
              ) : nearbyFailed ? (
                <p className="mt-2 text-ink-muted">Couldn&apos;t load what&apos;s around you — check your connection.</p>
              ) : nearby.places.length === 0 ? (
                <p className="mt-2 text-ink-muted">No detailed places for this area yet. Search or drop a pin to plan a walk.</p>
              ) : (
                <>
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                    {nearby.places.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => pick({ name: p.name, lat: p.lat, lon: p.lon, kind: p.kind })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
                          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink-muted" aria-hidden>
                            <Icon name={kindIcon(p.kind)} className="size-[18px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-mixed">{p.name}</span>
                            <span className="block truncate text-xs text-ink-muted">
                              {p.kind}
                              {p.hours ? ` · Listed hours ${p.hours}` : ""}
                            </span>
                          </span>
                          <span className="text-sm text-ink-subtle">{p.distanceM !== undefined ? formatDistance(p.distanceM, units) : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            {/* Recent women-safety context for her city: a count and a sheet, never a feed or a rating. */}
            <SafetyUpdatesSection point={me} />
          </div>
        )}
      </BottomSheet>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={pick}
        onDropPin={() => {
          setSearchOpen(false);
          setPinMode(true);
          setSnap("peek");
        }}
        saved={places}
        near={planActive ? planOrigin : me}
        osmOnly={planActive}
        placeholder="Search a place or address"
      />
      <UnsafeSheet
        open={unsafe}
        onClose={() => setUnsafe(false)}
        me={me}
        area={area}
        helpPoints={unsafeHelp}
        helpLoading={Boolean(me) && nearHelp?.key !== meKey}
        helpFailed={Boolean(nearHelp?.failed) && !chosen?.helpPoints.length}
        helpPartial={nearHelp?.evidence?.state === "partial" || chosen?.helpEvidence?.state === "partial"}
        onGoHelpPoint={(p) => {
          setUnsafe(false);
          pick({ name: p.name, lat: p.lat, lon: p.lon, kind: HELP_CLASSES[p.cls].label });
        }}
        goLabel="Walk there"
        share={unsafeShare}
        tell={tellAction}
        landmark={nearby.places[0]?.name ?? null}
        exclude={exclude}
      />
      <HelpNearSheet
        open={nearOpen}
        onClose={() => setNearOpen(false)}
        me={me}
        points={nearHelp?.points ?? []}
        evidence={nearHelp?.evidence ?? null}
        failed={Boolean(nearHelp?.failed)}
        onRetry={() => { setNearHelp(null); setHelpRetry((n) => n + 1); }}
        loading={Boolean(me) && nearHelp?.key !== meKey}
        exclude={exclude}
        onPick={(p) => {
          setNearOpen(false);
          pick({ name: p.name, lat: p.lat, lon: p.lon, kind: HELP_CLASSES[p.cls].label });
        }}
      />
      <SignInSheet open={signIn !== null} reason={signIn ?? undefined} onClose={() => setSignIn(null)} />
    </div>
  );
}
