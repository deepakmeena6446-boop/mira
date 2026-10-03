"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/map/WorldMap";
import { BottomSheet, type Snap } from "@/components/app/BottomSheet";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { HelpCluster } from "@/components/app/HelpCluster";
import { useChromeTop } from "@/lib/use-chrome-top";
import { useWide } from "@/lib/use-wide";
import { MiraPulse } from "@/components/app/MiraPulse";
import { journeyNextAction } from "@/lib/trip-actions";
import { haptic } from "@/lib/haptics";
import { UnsafeSheet } from "@/components/app/UnsafeSheet";
import { AfterArrival } from "@/components/app/AfterArrival";
import { HELP_ICON } from "@/components/app/kinds";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import { setLocation, useClock } from "@/lib/location-store";
import { shareLiveLink } from "@/lib/share";
import { clearTripRoutes, keepTripRoute, tripRoute } from "@/lib/trip-route";
import { HELP_CLASSES, hoursLine, isNight, rankHelpPoints, type HelpClass, type HelpPoint, type RankedHelpPoint } from "@/domain/help-points";
import { localTime } from "@/domain/opening-hours";
import { setCountry, useCountry, type CountryContext } from "@/lib/locale-store";
import { MISS_GRACE_MS } from "@/domain/journey";
import { journeyNoun, modeWords } from "@/domain/travel-prefs";
import type { EvidenceState } from "@/domain/evidence-state";
import type { TripView } from "@/server/trips";
import type { SafetyNet } from "@/server/health/safety-net";
import { requestLocation } from "@/lib/location-store";
import type { PlanOption, PlanOptionsResult } from "@/domain/plan-options";
import { usePlanDraft } from "@/lib/plan-store";

const time = (iso: string | number) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(s));
}

/** Help Points around her are looked up again only after she has moved this far. */
const HELP_REFETCH_M = 600;

export function TripScreen({
  initial,
  initialNet,
  tiles,
  helpExclude = [],
  canTell = false,
  emailAlerts = false,
}: {
  initial: TripView;
  initialNet: SafetyNet;
  tiles: { url: string; attribution: string; styleUrl?: string | null; nightStyleUrl?: string | null; nightUrl?: string | null; provider?: string };
  helpExclude?: string[];
  /** She has accepted trusted contacts and email is on: "Tell my people now" can reach someone. */
  canTell?: boolean;
  /** Mira can send email at all (smtpConfigured()). Without it, nobody is ever alerted automatically. */
  emailAlerts?: boolean;
}) {
  const router = useRouter();
  const planDraft = usePlanDraft();
  const toast = useToast();
  const [trip, setTrip] = useState(initial);
  const [net, setNet] = useState(initialNet);
  const [me, setMe] = useState(initial.lastLocation ? { lat: initial.lastLocation.lat, lon: initial.lastLocation.lon } : null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(initial.lastLocation ? Date.parse(initial.lastLocation.at) : null);
  const [lastAccuracyM, setLastAccuracyM] = useState<number | null>(null);
  const [lastUploadAt, setLastUploadAt] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  // The planned route lives on this device only (kept when the journey was started from the route sheet).
  const [route, setRoute] = useState<Array<[number, number]> | null>(() => (typeof window === "undefined" ? null : tripRoute(initial.id)));
  const [help, setHelp] = useState<{ at: { lat: number; lon: number }; points: HelpPoint[]; failed?: boolean; partial?: boolean } | null>(null);
  const countryIso = useCountry().iso;
  const osmMap = tiles.provider !== "google";
  const helpInFlight = useRef(false);
  const [focus, setFocus] = useState<RankedHelpPoint | null>(null);
  const [helpRoute, setHelpRoute] = useState<{ id: string; option: PlanOption | null; detail: string } | null>(null);
  const [pendingChange, setPendingChange] = useState<RankedHelpPoint | null>(null);
  const [manualEtaMinutes, setManualEtaMinutes] = useState(30);
  const [reviewedRoute, setReviewedRoute] = useState<PlanOption | null>(null);
  const [routeReviewMessage, setRouteReviewMessage] = useState<string | null>(null);
  const [unsafe, setUnsafe] = useState(false);
  const [area, setAreaName] = useState<string | null>(null);
  const exclude = helpExclude as HelpClass[];
  const walking = initial.mode === "walk" && initial.autoArrival;
  const clock = useClock(); // null during server render: times appear after hydration (the server doesn't know your zone)
  const now = clock?.getTime() ?? new Date(initial.etaAt).getTime();
  const freshMe = me && clock && lastFixAt !== null && clock.getTime() - lastFixAt < 120_000 ? me : null;
  const [snap, setSnap] = useState<Snap>("half");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [awake, setAwake] = useState(false);
  // Health of live sharing while the screen is open: GPS permission/availability, and whether uploads reach Mira.
  const [gps, setGps] = useState<"ok" | "denied" | "lost">("ok");
  const [uploadFailing, setUploadFailing] = useState(false);
  const lastSent = useRef<{ at: number; lat: number; lon: number } | null>(null);
  const open = trip.state === "active" || trip.state === "missed";
  const chromeRef = useRef<HTMLDivElement>(null);
  useChromeTop(chromeRef);
  const wide = useWide();
  // Immersive journey mode: no tab bar while the journey is open (globals.css `html[data-journey]`).
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset.journey = "open";
    return () => {
      delete root.dataset.journey;
    };
  }, [open]);

  const refresh = useCallback(async () => {
    const r = await api<{ trip: TripView | null; safetyNet?: SafetyNet }>("/api/trips/current");
    if (r.ok && r.data.trip) setTrip(r.data.trip);
    if (r.ok && r.data.safetyNet) setNet(r.data.safetyNet);
  }, []);

  useEffect(() => {
    const p = setInterval(refresh, 20_000);
    return () => clearInterval(p);
  }, [refresh]);

  const sharedOk = trip.sharedWith.filter((c) => c.notified);
  const onWhatsApp = trip.sharedWith.filter((c) => c.whatsapp);
  // Which WhatsApp chats she opened on this device (a convenience, per journey): "opened", never "sent".
  const openedKey = `mira.wa.${trip.id}`;
  const [openedSaved, setOpened] = useState<string[]>(() => {
    try {
      return typeof window === "undefined" ? [] : (JSON.parse(sessionStorage.getItem(openedKey) ?? "[]") as string[]);
    } catch {
      return [];
    }
  });
  // Shown only once the device clock exists (null while server-rendering and hydrating), so both renders agree.
  const opened = clock ? openedSaved : [];
  const markOpened = (name: string) =>
    setOpened((xs) => {
      const next = xs.includes(name) ? xs : [...xs, name];
      try {
        sessionStorage.setItem(openedKey, JSON.stringify(next));
      } catch {
        /* storage unavailable: the ✓ just won't survive a reload */
      }
      return next;
    });
  const upload = useCallback(
    async (p: { lat: number; lon: number; accuracy: number }) => {
      lastSent.current = { at: Date.now(), lat: p.lat, lon: p.lon };
      const r = await api<{ arrived: boolean }>(`/api/trips/${trip.id}/location`, { body: { lat: p.lat, lon: p.lon, accuracy: Math.round(p.accuracy) } });
      if (!r.ok) {
        setUploadFailing(true); // offline, rate-limited, or signed out: say so instead of pretending to share
        return;
      }
      setUploadFailing(false);
      setLastUploadAt(Date.now());
      if (r.data.arrived) {
        haptic("arrived");
        toast(sharedOk.length ? "You made it! Live sharing has stopped." : "You made it!");
        void refresh();
      }
    },
    [trip.id, refresh, toast, sharedOk.length],
  );

  // Route from where I am to the destination, when this device doesn't already have it.
  useEffect(() => {
    if (!me || route || !walking) return;
    void api<{ route: { geometry: Array<[number, number]>; approximate: boolean } }>("/api/geo/route", { body: { from: me, to: { lat: trip.destination.lat, lon: trip.destination.lon }, ...(osmMap ? { source: "osm" } : {}) } }).then((r) => {
      if (!r.ok) return;
      if (!r.data.route.approximate) {
        setRoute(r.data.route.geometry);
        keepTripRoute(trip.id, r.data.route.geometry);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me !== null]);

  // Where she is in words, and the emergency number for this country (once per journey screen).
  const hasFix = me !== null;
  useEffect(() => {
    if (!hasFix || !me) return;
    void api<{ label: string | null; country?: CountryContext }>("/api/geo/reverse", { body: { ...me, ...(osmMap ? { source: "osm" } : {}) } }).then((r) => {
      if (!r.ok) return;
      setAreaName(r.data.label);
      setCountry(r.data.country);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix]);

  // Help Points around her, fetched ahead (and again once she has moved on), so "I feel unsafe" is instant.
  useEffect(() => {
    if (!open || !freshMe || helpInFlight.current) return;
    if (help && !help.failed && haversine(help.at, freshMe) < HELP_REFETCH_M) return; // a failed lookup retries on the next fix
    helpInFlight.current = true;
    const at = freshMe;
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { ...at, ...(countryIso ? { country: countryIso } : {}), ...(osmMap ? { source: "osm" } : {}) } }).then((r) => {
      helpInFlight.current = false;
      // The API answers 200 with evidence "failed" when the providers didn't respond: that's a failed lookup, not "none nearby".
      const failed = !r.ok || r.data.evidence?.state === "failed";
      setHelp((cur) => (failed ? (cur && !cur.failed ? cur : { at, points: [], failed: true }) : { at, points: r.data.helpPoints, partial: r.data.evidence?.state === "partial" }));
    });
  }, [open, freshMe, help, countryIso, osmMap]);
  const night = isNight((clock ?? new Date()).getHours());
  const minuteKey = clock ? Math.floor(clock.getTime() / 60_000) : 0;
  const ranked = useMemo(
    () => (freshMe && help ? rankHelpPoints(help.points, freshMe, { situation: "route", night, route, now: minuteKey ? localTime(new Date(minuteKey * 60_000)) : undefined, exclude }) : []),
    [freshMe, help, night, route, minuteKey, exclude],
  );
  const nextHelp = ranked[0] ?? null;

  // Live location while the screen is open: throttled to 20 s or 50 m.
  useEffect(() => {
    if (!open || !("geolocation" in navigator)) return;
    const onFix = (pos: GeolocationPosition) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
      setGps("ok");
      setMe({ lat: p.lat, lon: p.lon });
      setLastFixAt(Date.now());
      setLastAccuracyM(p.accuracy);
      setLocation(p);
      const last = lastSent.current;
      // Every 20 s, or sooner after 50 m — but never more than every 8 s: in a fast ride 50 m passes in
      // 2 s, which would hit the server's 30/min limit and show "Can't reach Mira" for nothing.
      const since = last ? Date.now() - last.at : Infinity;
      if (last && (since < 8_000 || (since < 20_000 && haversine(last, p) < 50))) return;
      void upload(p);
    };
    const onError = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) setGps("denied");
      else if (e.code === e.POSITION_UNAVAILABLE) setGps("lost");
      // TIMEOUT just means no new fix yet (e.g. standing still) — not a problem.
    };
    // No timeout: a phone standing still at a bus stop may not produce new fixes for a while.
    let id: number | null = null;
    const startWatch = () => {
      if (id !== null || document.visibilityState !== "visible") return;
      id = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 10_000 });
    };
    const stopWatch = () => { if (id !== null) navigator.geolocation.clearWatch(id); id = null; };
    const onVisibility = () => {
      const shown = document.visibilityState === "visible";
      setVisible(shown);
      if (shown) { startWatch(); void refresh(); } else stopWatch();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    // Keep-alive: while you wait somewhere, re-send your spot every minute so contacts
    // (and the "location paused" check) know the trip is live, not frozen.
    const keepAlive = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (lastSent.current && Date.now() - lastSent.current.at < 55_000) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => void upload({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        onError,
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
      );
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopWatch();
      clearInterval(keepAlive);
    };
  }, [open, upload, refresh]);

  // Keep the screen awake during a live trip (browsers pause location when hidden).
  useEffect(() => {
    if (!open) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = (await navigator.wakeLock?.request("screen")) ?? null;
        if (cancelled) return void l?.release(); // left the trip while the request was pending
        lock = l;
        setAwake(Boolean(l));
      } catch {
        if (!cancelled) setAwake(false);
      }
    };
    void acquire();
    const onVis = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [open]);

  const act = async (action: "arrive" | "end" | "extend") => {
    setBusy(action);
    const r = await api<{ trip: TripView }>(`/api/trips/${trip.id}/${action}`, { body: action === "extend" ? { minutes: 10 } : {} });
    setBusy(null);
    setConfirmEnd(false);
    if (r.ok) {
      setTrip(r.data.trip);
      if (action === "arrive") haptic("arrived");
      if (action === "extend") toast("Added 10 minutes. Take your time.");
    } else toast(r.message, "error");
  };

  const share = async () => {
    if (!trip.shareUrl) return;
    const r = await shareLiveLink(trip.shareUrl, trip.autoArrival ? trip.destination.name : null, trip.mode);
    if (r === "copied") toast("Live link copied — anyone you send it to can follow until you arrive.");
    if (r === "failed") toast("Couldn't copy the link on this device.", "error");
  };

  const changeDestination = async (to: { lat: number; lon: number; name: string }, etaMinutes: number, geometry: [number, number][] | null = null) => {
    setBusy("change");
    const r = await api<{ trip: TripView }>(`/api/trips/${trip.id}/change`, { body: { to, etaMinutes } });
    setBusy(null);
    if (!r.ok) return toast(r.message, "error");
    clearTripRoutes();
    setRoute(geometry);
    if (geometry) keepTripRoute(trip.id, geometry);
    setTrip(r.data.trip);
    setFocus(null);
    setPendingChange(null);
    setReviewedRoute(null);
    setUnsafe(false);
    toast("Journey change saved. Your current contacts and live link are unchanged.");
  };

  const reviewCurrentRoute = async () => {
    setBusy("route-review");
    setRouteReviewMessage(null);
    setReviewedRoute(null);
    const fix = await requestLocation();
    if (!fix.point || fix.point.accuracy > 100 || Date.now() - fix.at > 30_000) { setBusy(null); return setRouteReviewMessage("A recent, accurate position is needed to review the route."); }
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");
    const r = await api<PlanOptionsResult>("/api/plan/options", { body: { from: { lat: fix.point.lat, lon: fix.point.lon }, to: { lat: trip.destination.lat, lon: trip.destination.lon }, departure: { local, timeZone: zone } } });
    setBusy(null);
    if (!r.ok) return setRouteReviewMessage("The mapped route check failed. Keep your current ETA or set one manually.");
    if (r.data.state !== "ready" || !r.data.options.length) return setRouteReviewMessage(`${r.data.detail} Your existing route and ETA are unchanged.`);
    setReviewedRoute(r.data.options[0]);
  };

  const reviewHelpRoute = async (point: RankedHelpPoint) => {
    setBusy("help-route");
    setHelpRoute(null);
    const fix = await requestLocation();
    if (!fix.point || fix.point.accuracy > 100 || Date.now() - fix.at > 30_000) {
      setHelpRoute({ id: point.id, option: null, detail: "A recent, accurate position is needed to check a route to this place." });
      setBusy(null);
      return;
    }
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");
    const result = await api<PlanOptionsResult>("/api/plan/options", { body: { from: { lat: fix.point.lat, lon: fix.point.lon }, to: { lat: point.lat, lon: point.lon }, departure: { local, timeZone: zone } } });
    setBusy(null);
    if (!result.ok) return setHelpRoute({ id: point.id, option: null, detail: "The mapped route check failed. Reachability is unknown; check directly before travelling." });
    const option = result.data.state === "ready" ? result.data.options[0] ?? null : null;
    setHelpRoute({ id: point.id, option, detail: option ? "Mapped walking estimate only. Access, staffing and opening remain unverified." : `${result.data.detail} Reachability is unknown.` });
  };

  const left = new Date(trip.etaAt).getTime() - now;
  const mins = Math.round(Math.abs(left) / 60_000);
  const span = mins >= 90 ? `${Math.round(mins / 60)} h` : `${mins} min`;
  const distance = me ? haversine(me, trip.destination) : null;

  if (!open) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-[calc(var(--tabbar-space)+2rem)] text-center">
        <span aria-hidden className={`grid size-14 place-items-center rounded-full ${trip.state === "arrived" ? "bg-accent-soft text-accent" : "bg-sunken text-ink-muted"}`}>
          <Icon name={trip.state === "arrived" ? "check" : "route"} className={`size-7 ${trip.state === "arrived" ? "mira-draw" : ""}`} />
        </span>
        <h1 className="mt-5 text-[1.75rem] font-semibold animate-rise">
          {!trip.autoArrival && trip.state !== "expired" ? "Sharing stopped" : trip.state === "arrived" ? "You made it." : trip.state === "ended" ? "Journey ended" : "Journey closed"}
        </h1>
        <p className="mt-2 max-w-sm text-ink-muted animate-rise">
          {!trip.autoArrival
            ? "Nobody can follow your live location any more."
            : trip.state === "arrived"
            ? `Glad you're at ${trip.destination.name}. ${sharedOk.length ? `${names(sharedOk.map((c) => c.name))} can see you arrived.` : "Your live link now just says you arrived."}`
            : "Live sharing is off."}
        </p>
        {/* The one question after a journey (or nothing): its own slot, extended in AfterArrival. */}
        <AfterArrival trip={trip} route={route} hour={clock ? clock.getHours() : null} onDone={() => clearTripRoutes()} />
        <p className="mt-6 max-w-sm text-sm text-ink-subtle">
          Journey details are deleted{trip.purgeAt && clock ? ` by ${time(trip.purgeAt)}` : " within a day"}. Mira doesn&apos;t keep a history of where you&apos;ve been.
        </p>
        <Link href="/report?from=journey" className="mt-3 inline-flex min-h-11 max-w-sm items-center justify-center gap-1.5 text-sm font-semibold text-ink-muted">
          <Icon name="flag" className="size-4" /> <span>Something happened on the way? Report it privately</span>
        </Link>
        <Button
          className="mt-6 max-w-xs"
          variant="primary"
          size="lg"
          onClick={() => {
            clearTripRoutes();
            router.push("/");
            router.refresh();
          }}
        >
          Done
        </Button>
        <Link href="/trips" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">
          Your trips
        </Link>
        {planDraft?.legs?.length ? <Link href="/plan" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">Review another planned leg</Link> : null}
      </div>
    );
  }

  const netDown = !net.worker;
  const fixAge = lastFixAt === null || !clock ? null : Math.max(0, Math.floor((clock.getTime() - lastFixAt) / 1000));
  const sharedAt = lastUploadAt ?? (trip.lastLocation ? Date.parse(trip.lastLocation.at) : null);
  const sharedAge = sharedAt === null || !clock ? null : Math.max(0, Math.floor((clock.getTime() - sharedAt) / 1000));
  const attention = netDown || gps !== "ok" || uploadFailing || trip.state === "missed" || trip.sharedWith.some((c) => c.viaEmail && !c.notified);
  const next = journeyNextAction({ missed: trip.state === "missed", whatsapp: onWhatsApp.map((c) => c.name), opened, following: sharedOk.length, canShare: Boolean(trip.shareUrl) });
  // Honest alert behaviour: only claim an automatic email when email works, someone accepted and got the link, and the worker is up.
  const alertsOn = emailAlerts && sharedOk.length > 0 && !netDown;
  const noun = journeyNoun(trip.autoArrival ? trip.mode : "other");
  const modeLine = trip.mode === "other" ? "" : modeWords(trip.mode).short;
  const aheadCount = ranked.filter((p) => p.ahead).length;
  const mapPins = ranked.slice(0, 6).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: HELP_ICON[p.cls] ?? "pin", strong: HELP_CLASSES[p.cls].emergency }));
  const directions = (p: { lat: number; lon: number }) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(5)},${p.lon.toFixed(5)}&travelmode=walking`;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <WorldMap tiles={tiles} me={me} dest={trip.destination} route={route} places={mapPins} follow presence={trip.state === "active" && !unsafe} label={`Live map of your journey to ${trip.destination.name}`} padding={wide ? { top: 40, bottom: 40, left: 88 + 400 + 40, right: 60 } : { top: 170, bottom: 420, left: 40, right: 40 }} />

      <div className="mira-chrome pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div ref={chromeRef} className="mx-auto max-w-xl">
        <div className="pointer-events-auto glass mx-auto flex max-w-xl items-center gap-3 rounded-[var(--radius-card)] border border-glass-edge px-4 py-2.5 shadow-[var(--shadow-float)]">
          <Link href="/trips" aria-label="Back to your trips" className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken">
            <Icon name="back" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-accent-strong">
              <MiraPulse size={12} state={trip.state === "missed" ? "attention" : "with-you"} />
              {sharedOk.length ? "Sharing live" : `${noun[0].toUpperCase()}${noun.slice(1)} in progress`}
            </p>
            <h1 className="truncate font-semibold">{trip.autoArrival ? `To ${trip.destination.name}${modeLine ? ` · ${modeLine}` : ""}` : "Sharing where you are"}</h1>
          </div>
        </div>
        <div className="pointer-events-auto mx-auto mt-2 max-w-xl">
          <HelpCluster onUnsafe={() => setUnsafe(true)} />
        </div>
        </div>
      </div>

      <BottomSheet snap={snap} onSnap={setSnap} label="Journey controls">
        {netDown ? (
          <div role="alert" className="mb-4 rounded-[var(--radius-card)] bg-warm-soft p-4">
            <p className="font-semibold text-warm">Missed-arrival checks are paused</p>
            <p className="mt-1 text-sm text-ink-muted">Mira&apos;s background service isn&apos;t responding, so nobody would be told if you don&apos;t arrive. Send your live link, or let someone know directly.</p>
          </div>
        ) : null}
        <p role="status" className="mb-4 rounded-[var(--radius-card)] bg-sunken p-3 text-sm text-ink-muted">
          {visible ? "Foreground location is on while this journey screen is visible. " : "This screen is hidden; location updates are paused. "}
          {fixAge === null ? "No device position yet. " : `Last device position ${fixAge < 60 ? `${fixAge} seconds` : `${Math.floor(fixAge / 60)} minutes`} ago. `}
          {lastAccuracyM === null ? "Position accuracy is not available for the saved fix. " : `Device reported about ${Math.round(lastAccuracyM)} m accuracy. `}
          {sharedAge === null ? "No position has reached Mira yet. " : `Last position shared ${sharedAge < 60 ? `${sharedAge} seconds` : `${Math.floor(sharedAge / 60)} minutes`} ago. `}
          {fixAge !== null && fixAge >= 120 ? "The map marker is a last known position, not your current position. " : ""}
          Browsers may stop updates when locked; missed check-ins still depend on the background service.
        </p>
        {gps !== "ok" || uploadFailing ? (
          <div role="status" className="mb-4 rounded-[var(--radius-card)] bg-warm-soft p-4">
            <p className="font-semibold text-warm">{gps === "denied" ? "Location is off for Mira" : gps === "lost" ? "Can't get your location right now" : "Can't reach Mira right now"}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {sharedOk.length ? "Your contacts are seeing your last spot. " : ""}
              {gps === "denied" ? "Turn location back on for this site in your browser settings." : gps === "lost" ? "It usually comes back once you're outdoors or have signal." : "Check your connection — Mira keeps trying."}
              {alertsOn ? " If you miss check-in, Mira still attempts an email after your ETA; sending can fail." : ""}
            </p>
          </div>
        ) : null}
        {trip.sharedWith.some((c) => c.viaEmail && !c.notified) ? (
          <div role="status" className="mb-4 rounded-[var(--radius-card)] bg-warm-soft p-4">
            <p className="font-semibold text-warm">
              Couldn&apos;t email your link to {names(trip.sharedWith.filter((c) => c.viaEmail && !c.notified).map((c) => c.name))}
            </p>
            <p className="mt-1 text-sm text-ink-muted">Tap &ldquo;Send my live link&rdquo; to send it yourself.</p>
          </div>
        ) : null}
        {trip.state === "missed" ? (
          <div role="alert" className="mb-4 rounded-[var(--radius-card)] bg-warm-soft p-4">
            <p className="font-semibold">Are you okay? Tap &ldquo;I&apos;m here&rdquo; if you&apos;ve arrived.</p>
            <p className="mt-1 text-sm text-ink-muted">
              {trip.alert === "sent"
                ? "I've let your contacts know you haven't checked in."
                : trip.alert === "claimed"
                  ? "I'm letting your contacts know now…"
                  : trip.alert === "failed" || trip.alert === "unconfirmed"
                    ? "I tried to reach your contacts but couldn't confirm the message went out."
                    : onWhatsApp.length
                      ? "Nobody was notified automatically — Mira can't send WhatsApp for you. Use “Send to …” above, or call someone."
                      : "Nobody was notified — either no contact on this trip has accepted your invite, or email isn't available right now."}{" "}
              If you&apos;re in danger, <EmergencyPill variant="link" />.
            </p>
          </div>
        ) : null}

        {/* 1. Who can see her, and what happens if she doesn't arrive — the Mira line, plainly. */}
        <div className="flex items-start gap-3">
          <MiraPulse size={16} state={attention ? "attention" : "with-you"} className="mt-[5px]" />
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            <span className="block text-[1.0625rem] font-medium leading-snug text-ink">{sharedOk.length ? `${names(sharedOk.map((c) => c.name))} can see where you are until you ${trip.autoArrival ? "arrive" : "stop sharing"}.` : "Only people you send your live link to can follow."}</span>{" "}
            {alertsOn
              ? `If you haven't ${trip.autoArrival ? "arrived" : "checked in"} ${Math.round(MISS_GRACE_MS / 60_000)} min after ${trip.autoArrival ? "your ETA" : "your sharing time ends"}, Mira emails ${sharedOk.length === 1 ? "them" : "them all"}.`
              : !emailAlerts
                ? `Nobody is alerted automatically if you don't ${trip.autoArrival ? "arrive" : "check in"} — Mira can't send email alerts yet. Your live link is how people follow you.`
                : netDown
                  ? "Nobody is alerted automatically right now — missed-arrival checks are paused."
                  : (
                      <>
                        Nobody is alerted automatically if you don&apos;t {trip.autoArrival ? "arrive" : "check in"} —{" "}
                        <Link href="/circle" className="font-semibold text-accent-strong">
                          add someone in Circle
                        </Link>{" "}
                        for that.
                      </>
                    )}
          </p>
        </div>

        {/* 2. Where and when: ETA in her local time, how far. */}
        <div className="mt-4">
          <p className="text-[13px] font-medium text-ink-subtle">{trip.autoArrival ? (left > 0 ? "Expected in" : "Expected") : "Sharing for"}</p>
          <p className="text-4xl font-semibold tabular-nums">{!clock ? "…" : left > 0 ? span : mins < 1 ? "now" : `${span} ago`}</p>
          <p className="text-ink-muted">
            {/* The ETA is the check-in time: the route's time plus spare time (etaFor), so it's later than the walk Home showed. */}
            {trip.autoArrival ? (clock ? `ETA ${time(trip.etaAt)}, with time to spare` : "ETA") : clock ? `Until ${time(trip.etaAt)}` : ""}
            {distance !== null && trip.autoArrival ? ` · ${distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1)} km`} to go` : ""}
          </p>
          {walking && route ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-subtle">
              <Icon name="route" className="size-4" /> Your planned route stays on this phone
              {aheadCount ? ` · ${aheadCount} Help Point${aheadCount === 1 ? "" : "s"} along it` : ""}
            </p>
          ) : null}
          {walking ? <div className="mt-3 rounded-[var(--radius-card)] bg-sunken p-3 text-sm"><Button variant="secondary" onClick={() => void reviewCurrentRoute()} busy={busy === "route-review"}>Review route from here</Button>{routeReviewMessage ? <p role="status" className="mt-2">{routeReviewMessage}</p> : null}{reviewedRoute ? <div className="mt-2"><p>A mapped walk from your latest position is about {Math.round(reviewedRoute.minutes)} min. Source: {reviewedRoute.evidence[0]?.status === "known" ? reviewedRoute.evidence[0].source.label : "unknown"}. Check actual access and conditions yourself.</p><Button variant="primary" onClick={() => void changeDestination(trip.destination, Math.min(235, Math.max(5, Math.ceil(reviewedRoute.minutes * 1.25) + 5)), reviewedRoute.geometry)} busy={busy === "change"}>Confirm route and ETA update</Button></div> : null}</div> : null}
        </div>


        {/* 3. The one next action (exactly one filled button), then the other journey actions. */}
        <div className="mt-4 grid gap-2.5">
          {next.kind === "whatsapp" ? null : next.kind === "share" ? (
            <Button variant="primary" size="lg" onClick={share} disabled={!trip.shareUrl}>
              <Icon name="share" className="size-5" /> Send my live link
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => act("arrive")} busy={busy === "arrive"} busyLabel={trip.autoArrival ? "Saving…" : "Stopping…"}>
              <Icon name="check" /> {trip.autoArrival ? <>I&apos;m here</> : <>I&apos;m okay — stop sharing</>}
            </Button>
          )}
          {/* Her WhatsApp contacts: each one tap, their own link, message ready. Mira opens WhatsApp; she presses Send. */}
          {onWhatsApp.length ? (
            <div>
              <ul className="grid gap-2">
                {onWhatsApp.map((c) => {
                  const isNext = next.kind === "whatsapp" && next.name === c.name;
                  return (
                    <li key={c.name}>
                      <a
                        href={c.whatsapp!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markOpened(c.name)}
                        data-variant={isNext ? "primary" : "secondary"}
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-button)] px-4 font-semibold ${isNext ? "bg-accent text-accent-ink" : opened.includes(c.name) ? "border border-line bg-accent-soft text-ink" : "border border-line-strong bg-surface text-ink"}`}
                      >
                        <Icon name={opened.includes(c.name) ? "check" : "send"} className="size-4" /> {opened.includes(c.name) ? `Opened WhatsApp for ${c.name} ✓` : `Send to ${c.name}`}
                      </a>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-xs text-ink-muted">Each link is theirs alone and stops when you {trip.autoArrival ? "arrive" : "stop sharing"}. Mira can&apos;t see whether you pressed Send.</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            {next.kind === "arrive" ? null : (
              <Button variant="secondary" onClick={() => act("arrive")} busy={busy === "arrive"} busyLabel={trip.autoArrival ? "Saving…" : "Stopping…"} className="col-span-2">
                <Icon name="check" className="size-4" /> {trip.autoArrival ? <>I&apos;m here</> : <>I&apos;m okay — stop sharing</>}
              </Button>
            )}
            {next.kind === "share" ? null : (
              <Button variant="secondary" onClick={share} disabled={!trip.shareUrl}>
                <Icon name="share" className="size-4" /> Send my live link
              </Button>
            )}
            <Button variant="secondary" onClick={() => act("extend")} busy={busy === "extend"} disabled={trip.extended || trip.state !== "active"} className={next.kind === "share" ? "col-span-2" : undefined}>
              <Icon name="clock" className="size-4" /> {trip.extended ? "Extended" : "+10 min"}
            </Button>
          </div>
        </div>
        {trip.checkRequestedAt && clock && clock.getTime() - new Date(trip.checkRequestedAt).getTime() < 30 * 60_000 ? (
          <p role="status" className="mt-3 rounded-2xl bg-mint-soft px-4 py-3 text-sm">
            You asked {sharedOk.length ? names(sharedOk.map((c) => c.name)) : "your people"} to check on you at {time(trip.checkRequestedAt)}. Mira didn&apos;t contact anyone else.
          </p>
        ) : null}

        {/* The nearest Help Point, ranked for right now */}
        {focus && freshMe ? (
          <div className="mt-3 rounded-[var(--radius-card)] bg-accent-soft p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-surface text-ink"><Icon name={HELP_ICON[focus.cls] ?? "pin"} className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{focus.name}</p>
                <p className="text-sm text-ink-muted">
                  {HELP_CLASSES[focus.cls].label} · roughly {focus.minutes} min by distance, route unverified · {hoursLine(focus)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">Staffing is not verified. Check the place directly before relying on it.</p>
                {helpRoute?.id === focus.id ? <p role="status" className="mt-1 text-sm">{helpRoute.option ? `Mapped walk from the checked position: about ${Math.round(helpRoute.option.minutes)} min · ${helpRoute.option.evidence[0]?.status === "known" ? helpRoute.option.evidence[0].source.label : "source unknown"}. ` : ""}{helpRoute.detail}</p> : null}
              </div>
              <button type="button" aria-label="Close" onClick={() => setFocus(null)} className="grid size-11 shrink-0 place-items-center rounded-full bg-surface">
                <Icon name="close" className="size-4" />
              </button>
            </div>
            <a href={directions(focus)} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface text-sm font-semibold text-accent-strong">
              Directions in Maps <Icon name="arrow" className="size-4" />
            </a>
            <Button variant="secondary" className="mt-2" onClick={() => void reviewHelpRoute(focus)} busy={busy === "help-route"}>Check mapped walk to this place</Button>
            {trip.state === "active" ? <Button variant="secondary" className="mt-2" onClick={() => { setPendingChange(focus); setManualEtaMinutes(30); }}>Change journey to this place</Button> : null}
            {pendingChange?.id === focus.id ? <div className="mt-2 rounded-lg bg-surface p-3 text-sm"><p>This changes your destination and check-in ETA. {helpRoute?.id === focus.id && helpRoute.option ? "A mapped walk was checked, but current access, opening hours and staffing are unverified." : "The route, opening hours and staffing have not been verified."} Your existing contacts and live link stay the same; nobody new is notified.</p><label className="mt-2 block">Minutes until check-in <input type="number" min={5} max={235} value={manualEtaMinutes} onChange={(e) => setManualEtaMinutes(Number(e.target.value))} className="ml-2 w-20 rounded border border-line p-2" /></label><div className="mt-2 flex gap-2"><Button variant="primary" disabled={!Number.isInteger(manualEtaMinutes) || manualEtaMinutes < 5 || manualEtaMinutes > 235} busy={busy === "change"} onClick={() => void changeDestination({ lat: focus.lat, lon: focus.lon, name: focus.name.slice(0, 80) }, manualEtaMinutes, helpRoute?.id === focus.id ? helpRoute.option?.geometry ?? null : null)}>Confirm change</Button><Button variant="secondary" onClick={() => setPendingChange(null)}>Cancel</Button></div></div> : null}
          </div>
        ) : nextHelp ? (
          <button type="button" onClick={() => setFocus(nextHelp)} className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] px-4 py-2 text-left hover:bg-sunken">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink"><Icon name={HELP_ICON[nextHelp.cls] ?? "pin"} className="size-[18px]" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ink-subtle">Nearest Help Point{nextHelp.ahead ? " ahead" : ""}</span>
              <span className="block truncate font-semibold">
                {nextHelp.name} <span className="font-normal text-ink-muted">· {HELP_CLASSES[nextHelp.cls].label} · roughly {nextHelp.minutes} min, route unverified</span>
              </span>
            </span>
            <Icon name="chevron" className="size-4" />
          </button>
        ) : clock && lastFixAt && !freshMe ? <p role="status" className="mt-3 text-sm text-ink-muted">Your last position is too old to rank nearby Help Points. Refresh location to compare places; Emergency and calling still work.</p> : null}

        <p className="mt-4 text-sm text-ink-muted">
          {awake ? "Mira is keeping your screen on. " : ""}
          Your location updates while this screen is open.{" "}
          {sharedOk.length ? "If you close Mira, they'll see your last spot. " : ""}
          {trip.autoArrival ? <>Tap &ldquo;I&apos;m here&rdquo; when you arrive if Mira hasn&apos;t noticed.</> : null}
        </p>

        <div className="mt-5">
          {confirmEnd ? (
            <div className="rounded-[var(--radius-card)] bg-sunken p-4">
              <p className="font-semibold">End the {noun}? Live sharing stops{alertsOn ? " and nobody is told if you don't arrive" : ""}.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" onClick={() => act("end")} busy={busy === "end"}>
                  End trip
                </Button>
                <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                  Keep going
                </Button>
              </div>
            </div>
          ) : trip.autoArrival ? (
            <button type="button" onClick={() => setConfirmEnd(true)} className="min-h-11 w-full rounded-full text-sm font-semibold text-ink-muted hover:bg-sunken">
              End trip without arriving
            </button>
          ) : null /* sharing where she is: "I'm okay — stop sharing" already ends it */}
        </div>
      </BottomSheet>

      <UnsafeSheet
        open={unsafe}
        onClose={() => setUnsafe(false)}
        me={freshMe}
        staleLocation={fixAge !== null && fixAge >= 120}
        helpPoints={help?.points ?? []}
        helpLoading={!help}
        helpFailed={Boolean(help?.failed)}
        helpPartial={Boolean(help?.partial)}
        route={route}
        onGoHelpPoint={(p) => {
          setUnsafe(false);
          setFocus(p);
          setSnap("half");
        }}
        goLabel="Show"
        share={trip.shareUrl ? { label: "Send my live link", detail: "Anyone you send it to sees where you are until you arrive.", onShare: share } : null}
        tell={
          canTell
            ? {
                names: trip.sharedWith.length ? trip.sharedWith.map((c) => c.name) : ["your trusted contacts"],
                email: emailAlerts && (trip.sharedWith.length ? trip.sharedWith.some((c) => c.viaEmail) : true),
                onTell: async () => {
                  const r = await api<{ told: string[]; failed: string[]; whatsapp: Array<{ name: string; url: string }>; trip: TripView }>(`/api/trips/${trip.id}/checkon`, { body: {} });
                  if (!r.ok) return { error: r.message };
                  setTrip(r.data.trip);
                  return { told: r.data.told, failed: r.data.failed, whatsapp: r.data.whatsapp };
                },
              }
            : null
        }
        area={area}
        landmark={nextHelp?.name ?? null}
        exclude={exclude}
        onTrip
      />
    </div>
  );
}
