"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/map/WorldMap";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { HelpCluster } from "@/components/app/HelpCluster";
import { useChromeTop } from "@/lib/use-chrome-top";
import { journeyNextAction } from "@/lib/trip-actions";
import { haptic } from "@/lib/haptics";
import { UnsafeSheet } from "@/components/app/UnsafeSheet";
import { AfterArrival } from "@/components/app/AfterArrival";
import { HELP_ICON } from "@/components/app/kinds";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { SkyCard, skyAt } from "@/components/mira/LiveNow";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import { setLocation, useClock } from "@/lib/location-store";
import { shareLiveLink } from "@/lib/share";
import { clearTripRoutes, keepTripRoute, tripRoute } from "@/lib/trip-route";
import { HELP_CLASSES, hoursLine, isNight, rankHelpPoints, type HelpClass, type HelpPoint, type RankedHelpPoint } from "@/domain/help-points";
import { setCountry, useCountry, type CountryContext } from "@/lib/locale-store";
import { MISS_GRACE_MS } from "@/domain/journey";
import { journeyNoun, modeWords } from "@/domain/travel-prefs";
import type { EvidenceState } from "@/domain/evidence-state";
import type { TripView } from "@/server/trips";
import type { SafetyNet } from "@/server/health/safety-net";
import { requestLocation } from "@/lib/location-store";
import type { PlanOption, PlanOptionsResult } from "@/domain/plan-options";
import { setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import { activatePlanLeg, intentFromLeg, resolvedDestination, resolvedOrigin } from "@/domain/plan-state";
import { instantForLocal } from "@/domain/plan-options";
import { RecipientPicker } from "@/components/app/RecipientPicker";
import { SavedReturnReview } from "@/components/app/SavedReturnReview";
import type { Contact } from "@/server/account/contacts";
import { localTimeInZone } from "@/domain/opening-hours";
import type { AlertState } from "@/domain/journey";

const time = (iso: string | number) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const deliveryLabel = (state: AlertState | undefined) => state === "sent" ? "accepted by email provider; receipt unknown" : state === "failed" ? "email rejected" : state === "claimed" ? "email attempt in progress" : state === "unconfirmed" ? "email acceptance unconfirmed" : "no email attempted";

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
  const country = useCountry();
  const countryIso = country.iso;
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
  // useClock() can lag real time by up to ~30 s (+ its tick), so a just-received fix may look "from the future": allow that lag.
  const freshMe = me && clock && lastFixAt !== null && clock.getTime() - lastFixAt >= -90_000 && clock.getTime() - lastFixAt < 120_000 && lastAccuracyM !== null && lastAccuracyM <= 100 ? me : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [awake, setAwake] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsState, setContactsState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [revokeConfirm, setRevokeConfirm] = useState<string | "owner" | null>(null);
  const shareActionKey = useRef<string | null>(null);
  const tellActionKey = useRef<string | null>(null);
  const changeAction = useRef<{ proposal: string; key: string } | null>(null);
  const latestPosition = useRef<{ point: { lat: number; lon: number }; at: number } | null>(null);
  const countryLookup = useRef<{ point: { lat: number; lon: number }; at: number } | null>(null);
  const countryLookupBusy = useRef(false);
  const [resume, setResume] = useState(0);
  // Health of live sharing while the screen is open: GPS permission/availability, and whether uploads reach Mira.
  const [gps, setGps] = useState<"ok" | "denied" | "lost">("ok");
  const [uploadFailing, setUploadFailing] = useState(false);
  const lastSent = useRef<{ at: number; lat: number; lon: number } | null>(null);
  const open = trip.state === "active" || trip.state === "missed";
  const chromeRef = useRef<HTMLDivElement>(null);
  useChromeTop(chromeRef);
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

  useEffect(() => {
    if (!sharingOpen || contactsState !== "idle") return;
    let active = true;
    void api<{ contacts: Contact[] }>("/api/me").then((result) => {
      if (!active) return;
      setContactsState(result.ok ? "ready" : "failed");
      if (result.ok) setContacts(result.data.contacts ?? []);
    });
    return () => { active = false; };
  }, [sharingOpen, contactsState]);

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
    async (p: { lat: number; lon: number; accuracy: number; at: number }) => {
      if (!Number.isFinite(p.at) || Date.now() - p.at < -10_000 || Date.now() - p.at >= 120_000 || !Number.isFinite(p.accuracy) || p.accuracy > 100) { setGps("lost"); return; }
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

  // A current jurisdiction is bound to a fresh fix, refreshed after movement, resumption or TTL.
  useEffect(() => {
    if (!open || !visible || !freshMe || countryLookupBusy.current) return;
    const previous = countryLookup.current;
    const checkedAt = Date.now();
    if (previous && haversine(previous.point, freshMe) < 250 && checkedAt - previous.at < (countryIso ? 60_000 : 10_000)) return;
    const point = { ...freshMe };
    countryLookup.current = { point, at: checkedAt };
    countryLookupBusy.current = true;
    void api<{ label: string | null; country?: CountryContext }>("/api/geo/reverse", { body: { ...point, ...(osmMap ? { source: "osm" } : {}) } }).then((r) => {
      countryLookupBusy.current = false;
      const latest = latestPosition.current;
      if (!r.ok || !latest || Date.now() - latest.at >= 120_000 || haversine(latest.point, point) > 250) return;
      setAreaName(r.data.label);
      setCountry(r.data.country, { point, checkedAt: latest.at });
    });
  }, [open, visible, freshMe, countryIso, osmMap, now, resume]);

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
  const placeTime = localTimeInZone(clock ?? new Date(), country.timezone);
  const night = placeTime ? isNight(Math.floor(placeTime.minute / 60)) : false;
  const minuteKey = clock ? Math.floor(clock.getTime() / 60_000) : 0;
  const ranked = useMemo(
    () => (freshMe && help ? rankHelpPoints(help.points, freshMe, { situation: "route", night, route, now: minuteKey ? localTimeInZone(new Date(minuteKey * 60_000), country.timezone) ?? undefined : undefined, timeZone: country.timezone, at: minuteKey ? minuteKey * 60_000 : undefined, exclude }) : []),
    [freshMe, help, night, route, minuteKey, exclude, country.timezone],
  );
  const nextHelp = ranked[0] ?? null;

  // Live location while the screen is open: throttled to 20 s or 50 m.
  useEffect(() => {
    if (!open || !("geolocation" in navigator)) return;
    const onFix = (pos: GeolocationPosition) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp };
      setLocation(p, pos.timestamp);
      if (!Number.isFinite(pos.timestamp) || Date.now() - pos.timestamp < -10_000 || Date.now() - pos.timestamp >= 120_000 || !Number.isFinite(p.accuracy) || p.accuracy > 100) { latestPosition.current = null; setLastFixAt(Number.isFinite(pos.timestamp) ? pos.timestamp : null); setLastAccuracyM(null); setGps("lost"); return; }
      latestPosition.current = { point: p, at: pos.timestamp };
      setGps("ok");
      setMe({ lat: p.lat, lon: p.lon });
      setLastFixAt(pos.timestamp);
      setLastAccuracyM(p.accuracy);
      const last = lastSent.current;
      // Every 20 s, or sooner after 50 m — but never more than every 8 s: in a fast ride 50 m passes in
      // 2 s, which would hit the server's 30/min limit and show "Can't reach Mira" for nothing.
      const since = last ? Date.now() - last.at : Infinity;
      if (last && (since < 8_000 || (since < 20_000 && haversine(last, p) < 50))) return;
      void upload(p);
    };
    const onError = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED || e.code === e.POSITION_UNAVAILABLE) {
        latestPosition.current = null;
        setLastAccuracyM(null);
        setLocation(null);
        setGps(e.code === e.PERMISSION_DENIED ? "denied" : "lost");
      }
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
      if (shown) { countryLookup.current = null; setResume((value) => value + 1); startWatch(); void refresh(); } else stopWatch();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    // Keep-alive: while you wait somewhere, re-send your spot every minute so contacts
    // (and the "location paused" check) know the trip is live, not frozen.
    const keepAlive = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (lastSent.current && Date.now() - lastSent.current.at < 55_000) return;
      navigator.geolocation.getCurrentPosition(
        onFix,
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

  const sharingAction = async (action: "share" | "revoke" | "link", body: object) => {
    setBusy(`sharing-${action}`);
    const result = await api<{ trip: TripView }>(`/api/trips/${trip.id}/${action}`, { body });
    setBusy(null);
    if (!result.ok) return toast(result.message, "error");
    setTrip(result.data.trip);
    setRevokeConfirm(null);
    if (action === "share") { setRecipientIds([]); shareActionKey.current = null; toast("Recipient choices saved. Check each delivery result below."); }
    else if (action === "revoke") toast("That live link has stopped working.");
    else toast("A new private link is ready. Nobody was contacted.");
  };

  const changeDestination = async (to: { lat: number; lon: number; name: string }, etaMinutes: number, geometry: [number, number][] | null = null) => {
    setBusy("change");
    const proposal = JSON.stringify({ to, etaMinutes });
    if (changeAction.current?.proposal !== proposal) changeAction.current = { proposal, key: crypto.randomUUID() };
    const r = await api<{ trip: TripView }>(`/api/trips/${trip.id}/change`, { body: { to, etaMinutes, idempotencyKey: changeAction.current.key } });
    setBusy(null);
    if (!r.ok) return toast(r.message, "error");
    changeAction.current = null;
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
  const returnIndex = planDraft?.legs?.findIndex((leg) => {
    const intent = intentFromLeg(leg);
    const from = intent ? resolvedOrigin(intent) : null;
    const to = intent ? resolvedDestination(intent) : null;
    const priorOrigin = planDraft.origin.kind === "named" ? planDraft.origin.resolution?.point : null;
    return Boolean(from && to && priorOrigin && haversine(from, trip.destination) <= 150 && haversine(to, priorOrigin) <= 150) || /^return\b/i.test(leg.label);
  }) ?? -1;
  const returnLeg = returnIndex >= 0 ? planDraft?.legs?.[returnIndex] : null;
  const returnPlan = planDraft && returnLeg && instantForLocal(returnLeg.departureLocal, returnLeg.timeZone) ? activatePlanLeg(planDraft, returnIndex) : null;

  if (!open) {
    const arrived = trip.state === "arrived";
    return (
      <div className="m-screen bg-companion flex flex-col items-center pb-[calc(var(--tabbar-space)+2rem)] text-center">
        <div className="m-screen-inner flex flex-col items-center pt-[12dvh]">
          <span aria-hidden className={`grid size-16 place-items-center rounded-full ${arrived ? "bg-accent-soft text-accent" : "bg-sunken text-ink-muted"}`}>
            <Icon name={arrived ? "check" : "route"} className={`size-8 ${arrived ? "mira-draw" : ""}`} />
          </span>
          <h1 className="m-display mt-6 animate-rise">
            {!trip.autoArrival && trip.state !== "expired" ? "Sharing stopped" : arrived ? "You made it." : trip.state === "ended" ? "Journey ended" : "Journey closed"}
          </h1>
          <p className="mt-3 max-w-sm text-[1.0625rem] text-ink-muted animate-rise">
            {!trip.autoArrival
              ? "Nobody can follow your live location any more."
              : arrived
              ? `Glad you're at ${trip.destination.name}. ${sharedOk.length ? `${names(sharedOk.map((c) => c.name))} can see you arrived.` : "Your live link now just says you arrived."}`
              : "Live sharing is off."}
          </p>
          {/* The one question after a journey (or nothing): a Mira Check that helps the next person. */}
          <div className="mt-6 w-full max-w-sm text-left">
            <AfterArrival trip={trip} route={route} hour={clock ? clock.getHours() : null} onDone={() => clearTripRoutes()} />
          </div>
          {arrived ? (
            <section className="m-card mt-4 w-full max-w-sm p-4 text-left" aria-label="Return journey">
              <h2 className="font-semibold">Your way back</h2>
              {returnPlan ? <><p className="mt-1 text-sm text-ink-muted">{returnPlan.origin.kind === "named" ? returnPlan.origin.query : "Origin"} → {returnPlan.destination.query} · {returnPlan.departureLocal.replace("T", " ")} ({returnPlan.timeZone}).</p><Button className="mt-3 w-full" variant="secondary" onClick={() => { clearTripRoutes(); setPlanDraft(returnPlan); router.push("/plan?planStep=options"); }}>Review return journey</Button></> : <><p className="mt-1 text-sm text-ink-muted">When you’re ready to head back, confirm the return places and time — Mira checks the way again for then.</p><Link href="/plan?planStep=return" className="mt-1 inline-flex min-h-11 items-center font-semibold text-accent-strong">Plan the return journey</Link></>}
              {!returnPlan ? <SavedReturnReview /> : null}
            </section>
          ) : null}
          <p className="mt-6 max-w-sm text-sm text-ink-subtle">
            Journey details are deleted{trip.purgeAt && clock ? ` by ${time(trip.purgeAt)}` : " within a day"}. Mira doesn&apos;t keep a history of where you&apos;ve been.
          </p>
          <Link href="/report?from=journey" className="mt-2 inline-flex min-h-11 max-w-sm items-center justify-center gap-2 text-sm font-semibold text-ink-muted">
            <Icon name="flag" className="size-4 shrink-0" /><span className="text-left">Something happened on the way? Report it privately</span>
          </Link>
          <Button className="mt-6 w-full max-w-xs" variant="primary" size="lg" onClick={() => { clearTripRoutes(); router.push("/"); router.refresh(); }}>Done</Button>
          <Link href="/trips" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">Your journeys</Link>
          {trip.state !== "arrived" && planDraft?.legs?.length ? <Link href="/plan?planStep=return" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">Review another planned leg</Link> : null}
        </div>
      </div>
    );
  }

  const netDown = !net.worker;
  const fixAge = lastFixAt === null || !clock ? null : Math.max(0, Math.floor((clock.getTime() - lastFixAt) / 1000));
  const sharedAt = lastUploadAt ?? (trip.lastLocation ? Date.parse(trip.lastLocation.at) : null);
  const sharedAge = sharedAt === null || !clock ? null : Math.max(0, Math.floor((clock.getTime() - sharedAt) / 1000));
  const missed = trip.state === "missed";
  const emailFailed = trip.sharedWith.filter((c) => c.viaEmail && !c.notified);
  const attention = netDown || gps !== "ok" || uploadFailing || missed || emailFailed.length > 0;
  const next = journeyNextAction({ missed, whatsapp: onWhatsApp.map((c) => c.name), opened, following: sharedOk.length, canShare: Boolean(trip.shareUrl) });
  // Honest alert behaviour: only claim an automatic email when email works, someone accepted and got the link, and the worker is up.
  const alertsOn = emailAlerts && trip.sharedWith.some((contact) => contact.viaEmail) && !netDown;
  const emailRecipients = trip.sharedWith.filter((contact) => contact.viaEmail);
  const acceptedAlerts = emailRecipients.filter((contact) => contact.alertDelivery === "sent");
  const uncertainAlerts = emailRecipients.filter((contact) => contact.alertDelivery === "unconfirmed" || contact.alertDelivery === "failed");
  const noun = journeyNoun(trip.autoArrival ? trip.mode : "other");
  const modeLine = trip.mode === "other" ? "" : modeWords(trip.mode).short;
  const aheadCount = ranked.filter((p) => p.ahead).length;
  const mapPins = ranked.slice(0, 6).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, icon: HELP_ICON[p.cls] ?? "pin", strong: HELP_CLASSES[p.cls].emergency }));
  const directions = (p: { lat: number; lon: number }) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(5)},${p.lon.toFixed(5)}&travelmode=walking`;
  // Who can see her, in one line (receipts only).
  const whoLine = sharedOk.length ? `The email provider accepted a journey link for ${names(sharedOk.map((c) => c.name))}. Receipt and viewing are unknown.` : onWhatsApp.length ? `${names(onWhatsApp.map((c) => c.name))} ${onWhatsApp.length === 1 ? "gets" : "get"} your link when you send it on WhatsApp.` : "Only people you send your live link to can follow.";
  const alertLine = alertsOn
    ? `If you haven't ${trip.autoArrival ? "arrived" : "checked in"} ${Math.round(MISS_GRACE_MS / 60_000)} min after ${trip.autoArrival ? "your ETA" : "your sharing time ends"}, Mira attempts an email to ${names(emailRecipients.map((contact) => contact.name))}. Sending can fail; receipt is unknown.`
    : !emailAlerts
      ? `Nobody is alerted automatically if you don't ${trip.autoArrival ? "arrive" : "check in"} — Mira can't send email alerts yet.`
      : netDown
        ? "Nobody is alerted automatically right now — missed-arrival checks are paused."
        : `Nobody is alerted automatically if you don't ${trip.autoArrival ? "arrive" : "check in"}.`;
  // The single most important degraded state, said once at the top; details live under "More".
  const issue = netDown
    ? { title: "Missed-arrival checks are paused", body: "Mira’s background service isn’t responding, so nobody would be told if you don’t arrive. Send your live link, or let someone know directly." }
    : gps === "denied" ? { title: "Location is off for Mira", body: "Turn location back on for this site in your browser settings. Your live link shows only your last uploaded position." }
    : gps === "lost" ? { title: "Can't get your location right now", body: "It usually comes back once you're outdoors or have signal. Your live link shows your last uploaded position." }
    : uploadFailing ? { title: "Can't reach Mira right now", body: "Check your connection — Mira keeps trying. Your live link shows your last uploaded position." }
    : emailFailed.length ? { title: `Couldn't email your link to ${names(emailFailed.map((c) => c.name))}`, body: "Tap “Send my live link” to send it yourself." }
    : null;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas">
      {/* The map shows where you are and Help Points ahead; everything on it is also said below. */}
      <div className="relative min-h-[30dvh] flex-1">
        <WorldMap tiles={tiles} me={me} dest={trip.destination} route={route} places={mapPins} follow presence={trip.state === "active" && !unsafe} label={`Live map of your journey to ${trip.destination.name}`} padding={{ top: 80, bottom: 40, left: 40, right: 40 }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div ref={chromeRef} className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between gap-2">
            <Link href="/trips" aria-label="Back to your trips" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface shadow-[var(--shadow-float)]">
              <Icon name="back" className="size-5" />
            </Link>
            <HelpCluster compact onUnsafe={() => setUnsafe(true)} />
          </div>
        </div>
      </div>

      <section aria-label="Journey controls" className="relative z-10 -mt-6 max-h-[68dvh] overflow-y-auto overscroll-contain rounded-t-[var(--radius-sheet)] bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[var(--shadow-sheet)]">
        <div className="mx-auto max-w-xl">
          {/* 1. Glance — the same sky card as Home: who's with you, how long, where. */}
          <SkyCard
            state={skyAt(clock, me ?? trip.destination)}
            label="Journey status"
            pulse={missed || attention ? "attention" : "with-you"}
            eyebrow={missed ? "Check-in due" : trip.sharedWith.length ? "Sharing enabled" : `${noun[0].toUpperCase()}${noun.slice(1)} in progress`}
            aside={trip.autoArrival ? (clock ? `ETA ${time(trip.etaAt)}` : "ETA") : clock ? `Until ${time(trip.etaAt)}` : null}
            title={<span className="flex items-baseline justify-between gap-3"><span className="min-w-0"><span className="block text-[0.72rem] font-medium tracking-normal text-[color:var(--sky-muted)]">{trip.autoArrival ? (left > 0 ? "Expected in" : "Expected") : "Sharing for"}</span><span className={cx("block tabular-nums", left > 0 ? "text-[2.75rem] leading-none" : "text-[1.75rem]")}>{!clock ? "…" : left > 0 ? span : mins < 1 ? "now" : `${span} ago`}</span></span></span>}
            line={<><h1 className="truncate font-semibold text-[color:var(--sky-ink)]">{trip.autoArrival ? `To ${trip.destination.name}${modeLine ? ` · ${modeLine}` : ""}` : "Sharing where you are"}</h1>{distance !== null && trip.autoArrival ? <span>{distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1)} km`} to go · ETA with time to spare</span> : null}</>}
          />

          {missed ? (
            <div role="alert" className="mt-3 rounded-2xl bg-warm-soft p-4">
              <p className="font-semibold">Are you okay? Tap &ldquo;I&apos;m here&rdquo; if you&apos;ve arrived.</p>
              <p className="mt-1 text-sm text-ink-muted">
                {trip.alert === "sent"
                  ? `The email provider accepted the missed-check-in message for ${names(acceptedAlerts.length ? acceptedAlerts.map((contact) => contact.name) : emailRecipients.map((contact) => contact.name))}. Receipt is unknown.`
                  : trip.alert === "claimed"
                    ? "I'm letting your contacts know now…"
                    : trip.alert === "failed" || trip.alert === "unconfirmed"
                      ? `${acceptedAlerts.length ? `The provider accepted email for ${names(acceptedAlerts.map((contact) => contact.name))}. ` : ""}${uncertainAlerts.length ? `Email was rejected or unconfirmed for ${names(uncertainAlerts.map((contact) => contact.name))}. ` : "The email attempt could not be confirmed. "}Call or message them directly.`
                      : onWhatsApp.length
                        ? "Nobody was notified automatically — Mira can't send WhatsApp for you. Use “Send to …” below, or call someone."
                        : "Nobody was notified — either no contact on this trip has accepted your invite, or email isn't available right now."}{" "}
                If you&apos;re in danger, <EmergencyPill variant="link" />.
              </p>
            </div>
          ) : issue ? (
            <div role={netDown ? "alert" : "status"} className="mt-3 rounded-2xl bg-warm-soft p-3.5">
              <p className="font-semibold text-warm">{issue.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{issue.body}</p>
            </div>
          ) : null}

          {/* 2. Who can see you — one line, receipts only. */}
          <p className="mt-3 text-sm text-ink-muted"><span className="font-medium text-ink">{whoLine}</span> {alertLine}</p>

          {/* 3. The one next action (filled), with "I'm here" always in reach. */}
          <div className="mt-4 grid gap-2">
            {onWhatsApp.length ? (
              <ul className="grid gap-2">
                {onWhatsApp.map((c) => {
                  const isNext = next.kind === "whatsapp" && next.name === c.name;
                  return (
                    <li key={c.name}>
                      <a href={c.whatsapp!} target="_blank" rel="noopener noreferrer" onClick={() => markOpened(c.name)} data-variant={isNext ? "primary" : "secondary"} className={cx("flex min-h-13 items-center justify-center gap-2 rounded-2xl px-4 font-semibold", isNext ? "bg-accent text-accent-ink" : opened.includes(c.name) ? "bg-accent-soft text-ink" : "bg-surface text-ink ring-1 ring-line-strong")}>
                        <Icon name={opened.includes(c.name) ? "check" : "send"} className="size-4" /> {opened.includes(c.name) ? `Opened WhatsApp for ${c.name} ✓` : `Send to ${c.name}`}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {next.kind === "share" ? (
              <Button variant="primary" size="lg" onClick={share} disabled={!trip.shareUrl}><Icon name="share" className="size-5" /> Send my live link</Button>
            ) : null}
            <Button variant={next.kind === "arrive" ? "primary" : "secondary"} size="lg" onClick={() => void act("arrive")} busy={busy === "arrive"}>
              <Icon name="check" className="size-5" /> {trip.autoArrival ? "I'm here" : "I'm okay — stop sharing"}
            </Button>
          </div>

          {/* 4. Quick, one-handed. */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => void act("extend")} disabled={busy === "extend" || trip.extended || trip.state !== "active"} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-sunken text-[0.8125rem] font-semibold disabled:opacity-45"><Icon name="clock" className="size-5" />{trip.extended ? "Extended" : "+10 min"}</button>
            <button type="button" onClick={share} disabled={!trip.shareUrl || next.kind === "share"} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-sunken text-[0.8125rem] font-semibold disabled:opacity-45"><Icon name="share" className="size-5" />{next.kind === "share" ? "Link above" : "Send link"}</button>
            <button type="button" onClick={() => (nextHelp && freshMe ? setFocus(nextHelp) : setUnsafe(true))} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-sunken text-[0.8125rem] font-semibold"><Icon name="shield" className="size-5" />Help near</button>
          </div>
          {trip.checkRequestedAt && clock && clock.getTime() - new Date(trip.checkRequestedAt).getTime() < 30 * 60_000 ? (
            <p role="status" className="mt-3 rounded-2xl bg-mint-soft px-4 py-3 text-sm">
              Check-in request at {time(trip.checkRequestedAt)}. {trip.sharedWith.filter((contact) => contact.checkDelivery === "sent").length ? `Email accepted for ${names(trip.sharedWith.filter((contact) => contact.checkDelivery === "sent").map((contact) => contact.name))}; receipt is unknown. ` : "No email acceptance is confirmed. "}Mira didn&apos;t contact anyone else.
            </p>
          ) : null}

          {/* 5. The nearest Help Point, ranked for right now (or its detail when chosen). */}
          {focus && freshMe ? (
            <div className="mt-3 rounded-2xl bg-accent-soft p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-ink"><Icon name={HELP_ICON[focus.cls] ?? "pin"} className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{focus.name}</p>
                  <p className="text-sm text-ink-muted">{HELP_CLASSES[focus.cls].label} · roughly {focus.minutes} min by distance, route unverified · {hoursLine(focus)}</p>
                  <p className="mt-1 text-xs text-ink-subtle">Staffing is not verified. Check the place directly before relying on it.</p>
                  {helpRoute?.id === focus.id ? <p role="status" className="mt-1 text-sm">{helpRoute.option ? `Mapped walk from the checked position: about ${Math.round(helpRoute.option.minutes)} min · ${helpRoute.option.evidence[0]?.status === "known" ? helpRoute.option.evidence[0].source.label : "source unknown"}. ` : ""}{helpRoute.detail}</p> : null}
                </div>
                <button type="button" aria-label="Close" onClick={() => setFocus(null)} className="grid size-11 shrink-0 place-items-center rounded-full bg-surface"><Icon name="close" className="size-4" /></button>
              </div>
              <a href={directions(focus)} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface text-sm font-semibold text-accent-strong">Directions in Maps <Icon name="arrow" className="size-4" /></a>
              <Button variant="secondary" className="mt-2 w-full" onClick={() => void reviewHelpRoute(focus)} busy={busy === "help-route"}>Check mapped walk to this place</Button>
              {trip.state === "active" ? <Button variant="secondary" className="mt-2 w-full" onClick={() => { setPendingChange(focus); setManualEtaMinutes(30); }}>Change journey to this place</Button> : null}
              {pendingChange?.id === focus.id ? <div className="mt-2 rounded-xl bg-surface p-3 text-sm"><p>This changes your destination and check-in ETA. {helpRoute?.id === focus.id && helpRoute.option ? "A mapped walk was checked, but current access, opening hours and staffing are unverified." : "The route, opening hours and staffing have not been verified."} Your existing contacts and live link stay the same; nobody new is notified.</p><label className="mt-2 block">Minutes until check-in <input type="number" min={5} max={235} value={manualEtaMinutes} onChange={(e) => setManualEtaMinutes(Number(e.target.value))} className="ml-2 w-20 rounded-lg bg-sunken p-2" /></label><div className="mt-2 flex gap-2"><Button variant="primary" disabled={!Number.isInteger(manualEtaMinutes) || manualEtaMinutes < 5 || manualEtaMinutes > 235} busy={busy === "change"} onClick={() => void changeDestination({ lat: focus.lat, lon: focus.lon, name: focus.name.slice(0, 80) }, manualEtaMinutes, helpRoute?.id === focus.id ? helpRoute.option?.geometry ?? null : null)}>Confirm change</Button><Button variant="ghost" onClick={() => setPendingChange(null)}>Cancel</Button></div></div> : null}
            </div>
          ) : nextHelp ? (
            <button type="button" onClick={() => setFocus(nextHelp)} className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-sunken">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-ink"><Icon name={HELP_ICON[nextHelp.cls] ?? "pin"} className="size-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink-subtle">Nearest Help Point{nextHelp.ahead ? " ahead" : ""}{aheadCount > 1 ? ` · ${aheadCount} ahead on your route` : ""}</span>
                <span className="block truncate font-semibold">{nextHelp.name} <span className="font-normal text-ink-muted">· {HELP_CLASSES[nextHelp.cls].label} · roughly {nextHelp.minutes} min, route unverified</span></span>
              </span>
              <Icon name="chevron" className="size-4" />
            </button>
          ) : clock && lastFixAt && !freshMe ? <p role="status" className="mt-3 text-sm text-ink-muted">Your last position is too old to rank nearby Help Points. Refresh location to compare places; Emergency and calling still work.</p> : null}

          {/* 6. Everything else, one tap away. */}
          <details className="group mt-4 rounded-2xl bg-sunken/60" open={sharingOpen || undefined}>
            <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-4 font-semibold [&::-webkit-details-marker]:hidden">More — sharing, timing, details<Icon name="chevron" className="size-4 transition-transform group-open:rotate-90" /></summary>
            <div className="space-y-4 px-4 pb-4">
              <section aria-label="Journey sharing">
                <Button variant="secondary" className="w-full" onClick={() => setSharingOpen((value) => !value)}>{sharingOpen ? "Hide sharing controls" : "Manage who follows"}</Button>
                {sharingOpen ? <div className="mt-3 space-y-3">
                  <p className="text-sm text-ink-muted">Only the people selected for this journey have their own links. Removing a link here keeps their saved contact.</p>
                  {trip.sharedWith.length ? <ul className="space-y-3">{trip.sharedWith.map((contact) => <li key={contact.id} className="rounded-xl bg-surface p-3 text-sm">
                    <p className="font-semibold">{contact.name}</p>
                    <p>Live-link email: {deliveryLabel(contact.linkDelivery)}.</p>
                    <p>Missed check-in: {deliveryLabel(contact.alertDelivery)}.</p>
                    {contact.checkDelivery !== "none" ? <p>Chosen check-in request: {deliveryLabel(contact.checkDelivery)}.</p> : null}
                    {contact.whatsapp ? <p>You send their WhatsApp link yourself; Mira cannot confirm Send.</p> : null}
                    {revokeConfirm === contact.id ? <div className="mt-2 flex gap-2"><Button variant="danger" busy={busy === "sharing-revoke"} onClick={() => void sharingAction("revoke", { contactId: contact.id })}>Confirm remove {contact.name}&apos;s journey link</Button><Button variant="ghost" onClick={() => setRevokeConfirm(null)}>Keep link</Button></div> : <Button variant="secondary" className="mt-2" onClick={() => setRevokeConfirm(contact.id)}>Remove {contact.name}&apos;s journey link</Button>}
                  </li>)}</ul> : <p className="text-sm">No selected recipients. Nobody receives automatic contact emails.</p>}
                  {contactsState === "failed" ? <div role="status"><p>Contact choices could not load. Existing links are unchanged.</p><Button variant="secondary" onClick={() => setContactsState("idle")}>Retry contact choices</Button></div> : contactsState !== "ready" ? <p role="status">Loading contact choices…</p> : <>
                    <RecipientPicker contacts={contacts.filter((contact) => !trip.sharedWith.some((recipient) => recipient.id === contact.id))} selectedIds={recipientIds} onChange={(ids) => { setRecipientIds(ids); shareActionKey.current = null; }} disabled={busy === "sharing-share"} />
                    {recipientIds.length ? <><p className="text-sm">Confirm live links for {names(contacts.filter((contact) => recipientIds.includes(contact.id)).map((contact) => contact.name))}? Mira attempts accepted-contact emails; WhatsApp still requires Send.</p><Button variant="primary" busy={busy === "sharing-share"} onClick={() => { shareActionKey.current ??= crypto.randomUUID(); void sharingAction("share", { recipientIds, idempotencyKey: shareActionKey.current }); }}>Confirm chosen recipients</Button></> : null}
                  </>}
                  <div className="rounded-xl bg-surface p-3 text-sm">
                    <p>Your copied live link can be forwarded by its recipient. Invalidate it to stop everyone using that copy; selected contacts&apos; individual links stay unchanged.</p>
                    {!trip.shareUrl ? <Button variant="secondary" className="mt-2" busy={busy === "sharing-link"} onClick={() => void sharingAction("link", {})}>Create a new private live link</Button> : revokeConfirm === "owner" ? <div className="mt-2 flex gap-2"><Button variant="danger" busy={busy === "sharing-revoke"} onClick={() => void sharingAction("revoke", { ownerLink: true })}>Confirm invalidate copied live link</Button><Button variant="ghost" onClick={() => setRevokeConfirm(null)}>Keep link</Button></div> : <Button variant="secondary" className="mt-2" onClick={() => setRevokeConfirm("owner")}>Invalidate copied live link</Button>}
                  </div>
                </div> : null}
              </section>

              {walking ? <div className="text-sm"><Button variant="secondary" className="w-full" onClick={() => void reviewCurrentRoute()} busy={busy === "route-review"}>Review route from here</Button>{routeReviewMessage ? <p role="status" className="mt-2">{routeReviewMessage}</p> : null}{reviewedRoute ? <div className="mt-2"><p>A mapped walk from your latest position is about {Math.round(reviewedRoute.minutes)} min. Source: {reviewedRoute.evidence[0]?.status === "known" ? reviewedRoute.evidence[0].source.label : "unknown"}. Check actual access and conditions yourself.</p><Button variant="primary" className="mt-2" onClick={() => void changeDestination(trip.destination, Math.min(235, Math.max(5, Math.ceil(reviewedRoute.minutes * 1.25) + 5)), reviewedRoute.geometry)} busy={busy === "change"}>Confirm route and ETA update</Button></div> : null}</div> : null}
              <details id="journey-timing-review" className="rounded-xl bg-surface p-3 text-sm"><summary className="min-h-11 cursor-pointer py-2.5 font-semibold">Review check-in timing</summary><p>This is your remaining-time estimate. Destination and recipients stay the same; no route or operating service is confirmed by changing it.</p><label className="mt-3 block font-semibold">Minutes from now until check-in<input type="number" min={5} max={235} value={manualEtaMinutes} onChange={(event) => setManualEtaMinutes(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3" /></label><Button variant="primary" className="mt-3" disabled={!Number.isInteger(manualEtaMinutes) || manualEtaMinutes < 5 || manualEtaMinutes > 235} busy={busy === "change"} onClick={() => void changeDestination(trip.destination, manualEtaMinutes, route)}>Confirm check-in time change</Button></details>

              <section aria-label="Position and updates" role="status" className="rounded-xl bg-surface p-3 text-sm text-ink-muted">
                <p className="font-semibold text-ink">Position and updates</p>
                <p className="mt-1">
                  {visible ? "Foreground location is on while this journey screen is visible. " : "This screen is hidden; location updates are paused. "}
                  {fixAge === null ? "No device position yet. " : `Last device position ${fixAge < 60 ? `${fixAge} seconds` : `${Math.floor(fixAge / 60)} minutes`} ago. `}
                  {lastAccuracyM === null ? "Position accuracy is not available for the saved fix. " : `Device reported about ${Math.round(lastAccuracyM)} m accuracy. `}
                  {sharedAge === null ? "No position has reached Mira yet. " : `Last position shared ${sharedAge < 60 ? `${sharedAge} seconds` : `${Math.floor(sharedAge / 60)} minutes`} ago. `}
                  {fixAge !== null && fixAge >= 120 ? "The map marker is a last known position, not your current position. " : ""}
                  Browsers may stop updates when locked; missed check-ins still depend on the background service.
                  {awake ? " Mira is keeping your screen on." : ""}
                </p>
                {walking && route && clock ? <p className="mt-1">Your planned route stays on this phone{aheadCount ? ` · ${aheadCount} Help Point${aheadCount === 1 ? "" : "s"} along it` : ""}.</p> : null}
              </section>

              {confirmEnd ? (
                <div className="rounded-xl bg-surface p-4">
                  <p className="font-semibold">End the {noun}? Live sharing stops{alertsOn ? " and nobody is told if you don't arrive" : ""}.</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="danger" onClick={() => act("end")} busy={busy === "end"}>End trip</Button>
                    <Button variant="ghost" onClick={() => setConfirmEnd(false)}>Keep going</Button>
                  </div>
                </div>
              ) : trip.autoArrival ? (
                <button type="button" onClick={() => setConfirmEnd(true)} className="min-h-11 w-full rounded-full text-sm font-semibold text-ink-muted hover:bg-surface">End trip without arriving</button>
              ) : null}
            </div>
          </details>
          <p className="mt-3 px-1 text-xs text-ink-subtle">{visible ? `Device position ${fixAge === null ? "not yet available" : `${fixAge}s ago`}${uploadFailing ? " · upload failed" : sharedAge === null ? " · nothing sent yet" : ` · update sent ${sharedAge}s ago`}` : "Updates paused while hidden"}{trip.autoArrival ? " · Tap “I’m here” when you arrive if Mira hasn’t noticed." : ""}</p>
        </div>
      </section>

      <UnsafeSheet
        open={unsafe}
        change={{ label: "Review route or timing", detail: "Keep this journey and recipients. Review first; a change needs your confirmation.", onReview: () => { setUnsafe(false); window.setTimeout(() => { const review = document.getElementById("journey-timing-review") as HTMLDetailsElement | null; if (review) { (review.parentElement?.closest("details") as HTMLDetailsElement | null)?.setAttribute("open", ""); review.open = true; review.scrollIntoView({ block: "nearest" }); review.querySelector("summary")?.focus(); } }, 0); } }}
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
        }}
        goLabel="Show"
        share={trip.shareUrl ? { label: "Send my live link", detail: "A valid link can show your last uploaded position until sharing stops. Receipt and viewing are unknown.", onShare: share } : null}
        tell={
          trip.sharedWith.length > 0 && (emailAlerts && emailRecipients.length > 0 || onWhatsApp.length > 0)
            ? {
                names: trip.sharedWith.map((c) => c.name),
                email: emailAlerts && emailRecipients.length > 0,
                onTell: async () => {
                  tellActionKey.current ??= crypto.randomUUID();
                  const r = await api<{ told: string[]; failed: string[]; unconfirmed: string[]; whatsapp: Array<{ name: string; url: string }>; trip: TripView }>(`/api/trips/${trip.id}/checkon`, { body: { idempotencyKey: tellActionKey.current } });
                  if (!r.ok) return { error: r.message };
                  setTrip(r.data.trip);
                  tellActionKey.current = null;
                  return { told: r.data.told, failed: [...r.data.failed, ...r.data.unconfirmed], whatsapp: r.data.whatsapp };
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
