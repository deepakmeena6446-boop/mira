"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/map/WorldMap";
import { BottomSheet, type Snap } from "@/components/app/BottomSheet";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Avatar } from "@/components/app/Avatar";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { UnsafeSheet } from "@/components/app/UnsafeSheet";
import { AfterArrival } from "@/components/app/AfterArrival";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import { setLocation, useClock } from "@/lib/location-store";
import { shareLiveLink } from "@/lib/share";
import { clearTripRoutes, keepTripRoute, tripRoute } from "@/lib/trip-route";
import { HELP_CLASSES, hoursLine, isNight, rankHelpPoints, type HelpClass, type HelpPoint, type RankedHelpPoint } from "@/domain/help-points";
import { localTime } from "@/domain/opening-hours";
import { setCountry, type CountryContext } from "@/lib/locale-store";
import { MISS_GRACE_MS } from "@/domain/journey";
import { journeyNoun, modeWords } from "@/domain/travel-prefs";
import type { TripView } from "@/server/trips";
import type { SafetyNet } from "@/server/health/safety-net";

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
  tiles: { url: string; attribution: string; styleUrl?: string | null; nightStyleUrl?: string | null; nightUrl?: string | null };
  helpExclude?: string[];
  /** She has accepted trusted contacts and email is on: "Tell my people now" can reach someone. */
  canTell?: boolean;
  /** MIRA can send email at all (smtpConfigured()). Without it, nobody is ever alerted automatically. */
  emailAlerts?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [trip, setTrip] = useState(initial);
  const [net, setNet] = useState(initialNet);
  const [me, setMe] = useState(initial.lastLocation ? { lat: initial.lastLocation.lat, lon: initial.lastLocation.lon } : null);
  // The planned route lives on this device only (kept when the journey was started from the route sheet).
  const [route, setRoute] = useState<Array<[number, number]> | null>(() => (typeof window === "undefined" ? null : tripRoute(initial.id)));
  const [help, setHelp] = useState<{ at: { lat: number; lon: number }; points: HelpPoint[]; failed?: boolean } | null>(null);
  const helpInFlight = useRef(false);
  const [focus, setFocus] = useState<RankedHelpPoint | null>(null);
  const [unsafe, setUnsafe] = useState(false);
  const [area, setAreaName] = useState<string | null>(null);
  const exclude = helpExclude as HelpClass[];
  const walking = initial.mode === "walk" && initial.autoArrival;
  const clock = useClock(); // null during server render: times appear after hydration (the server doesn't know your zone)
  const now = clock?.getTime() ?? new Date(initial.etaAt).getTime();
  const [snap, setSnap] = useState<Snap>("half");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [awake, setAwake] = useState(false);
  // Health of live sharing while the screen is open: GPS permission/availability, and whether uploads reach MIRA.
  const [gps, setGps] = useState<"ok" | "denied" | "lost">("ok");
  const [uploadFailing, setUploadFailing] = useState(false);
  const lastSent = useRef<{ at: number; lat: number; lon: number } | null>(null);
  const open = trip.state === "active" || trip.state === "missed";

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
  const upload = useCallback(
    async (p: { lat: number; lon: number; accuracy: number }) => {
      lastSent.current = { at: Date.now(), lat: p.lat, lon: p.lon };
      const r = await api<{ arrived: boolean }>(`/api/trips/${trip.id}/location`, { body: { lat: p.lat, lon: p.lon, accuracy: Math.round(p.accuracy) } });
      if (!r.ok) {
        setUploadFailing(true); // offline, rate-limited, or signed out: say so instead of pretending to share
        return;
      }
      setUploadFailing(false);
      if (r.data.arrived) {
        toast(sharedOk.length ? "You made it! Live sharing has stopped." : "You made it!");
        void refresh();
      }
    },
    [trip.id, refresh, toast, sharedOk.length],
  );

  // Route from where I am to the destination, when this device doesn't already have it.
  useEffect(() => {
    if (!me || route || !walking) return;
    void api<{ route: { geometry: Array<[number, number]>; approximate: boolean } }>("/api/geo/route", { body: { from: me, to: { lat: trip.destination.lat, lon: trip.destination.lon } } }).then((r) => {
      if (!r.ok) return;
      setRoute(r.data.route.geometry);
      if (!r.data.route.approximate) keepTripRoute(trip.id, r.data.route.geometry);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me !== null]);

  // Where she is in words, and the emergency number for this country (once per journey screen).
  const hasFix = me !== null;
  useEffect(() => {
    if (!hasFix || !me) return;
    void api<{ label: string | null; country?: CountryContext }>("/api/geo/reverse", { body: me }).then((r) => {
      if (!r.ok) return;
      setAreaName(r.data.label);
      setCountry(r.data.country);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix]);

  // Help Points around her, fetched ahead (and again once she has moved on), so "I feel unsafe" is instant.
  useEffect(() => {
    if (!open || !me || helpInFlight.current) return;
    if (help && !help.failed && haversine(help.at, me) < HELP_REFETCH_M) return; // a failed lookup retries on the next fix
    helpInFlight.current = true;
    const at = me;
    void api<{ helpPoints: HelpPoint[] }>("/api/geo/help", { body: at }).then((r) => {
      helpInFlight.current = false;
      setHelp((cur) => (r.ok ? { at, points: r.data.helpPoints } : (cur ?? { at, points: [], failed: true })));
    });
  }, [open, me, help]);
  const night = isNight((clock ?? new Date()).getHours());
  const minuteKey = clock ? Math.floor(clock.getTime() / 60_000) : 0;
  const ranked = useMemo(
    () => (me && help ? rankHelpPoints(help.points, me, { situation: "route", night, route, now: minuteKey ? localTime(new Date(minuteKey * 60_000)) : undefined, exclude }) : []),
    [me, help, night, route, minuteKey, exclude],
  );
  const nextHelp = ranked[0] ?? null;

  // Live location while the screen is open: throttled to 20 s or 50 m.
  useEffect(() => {
    if (!open || !("geolocation" in navigator)) return;
    const onFix = (pos: GeolocationPosition) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
      setGps("ok");
      setMe({ lat: p.lat, lon: p.lon });
      setLocation(p);
      const last = lastSent.current;
      if (last && Date.now() - last.at < 20_000 && haversine(last, p) < 50) return;
      void upload(p);
    };
    const onError = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) setGps("denied");
      else if (e.code === e.POSITION_UNAVAILABLE) setGps("lost");
      // TIMEOUT just means no new fix yet (e.g. standing still) — not a problem.
    };
    // No timeout: a phone standing still at a bus stop may not produce new fixes for a while.
    const id = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 10_000 });
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
      navigator.geolocation.clearWatch(id);
      clearInterval(keepAlive);
    };
  }, [open, upload]);

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
      if (action === "extend") toast("Added 10 minutes. Take your time.");
    } else toast(r.message, "error");
  };

  const share = async () => {
    if (!trip.shareUrl) return;
    const r = await shareLiveLink(trip.shareUrl, trip.autoArrival ? trip.destination.name : null, trip.mode);
    if (r === "copied") toast("Live link copied — anyone you send it to can follow until you arrive.");
    if (r === "failed") toast("Couldn't copy the link on this device.", "error");
  };

  const left = new Date(trip.etaAt).getTime() - now;
  const mins = Math.round(Math.abs(left) / 60_000);
  const span = mins >= 90 ? `${Math.round(mins / 60)} h` : `${mins} min`;
  const distance = me ? haversine(me, trip.destination) : null;

  if (!open) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-32 text-center">
        <div className="animate-rise">
          <MiraOrb size={84} />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold animate-rise">
          {!trip.autoArrival && trip.state !== "expired" ? "Sharing stopped" : trip.state === "arrived" ? "You made it 🎉" : trip.state === "ended" ? "Journey ended" : "Journey closed"}
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
          Journey details are deleted{trip.purgeAt && clock ? ` by ${time(trip.purgeAt)}` : " within a day"}. MIRA doesn&apos;t keep a history of where you&apos;ve been.
        </p>
        <Link href="/report" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-ink-muted">
          <Icon name="flag" className="size-4" /> Something happened on the way? Report it privately
        </Link>
        <Button
          className="mt-6 max-w-xs"
          variant="hero"
          size="lg"
          onClick={() => {
            clearTripRoutes();
            router.push("/");
            router.refresh();
          }}
        >
          Back home
        </Button>
        <Link href="/trips" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-accent">
          Your trips
        </Link>
      </div>
    );
  }

  const netDown = !net.worker;
  // Honest alert behaviour: only claim an automatic email when email works, someone accepted and got the link, and the worker is up.
  const alertsOn = emailAlerts && sharedOk.length > 0 && !netDown;
  const noun = journeyNoun(trip.autoArrival ? trip.mode : "other");
  const modeLine = trip.mode === "other" ? "" : modeWords(trip.mode).short;
  const aheadCount = ranked.filter((p) => p.ahead).length;
  const mapPins = ranked.slice(0, 6).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, emoji: HELP_CLASSES[p.cls].emoji }));
  const directions = (p: { lat: number; lon: number }) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(5)},${p.lon.toFixed(5)}&travelmode=walking`;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <WorldMap tiles={tiles} me={me} dest={trip.destination} route={route} places={mapPins} follow label={`Live map of your journey to ${trip.destination.name}`} padding={{ top: 170, bottom: 420, left: 40, right: 40 }} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto glass mx-auto flex max-w-xl items-center gap-3 rounded-[1.6rem] border border-glass-edge px-4 py-3 shadow-[var(--shadow-card)]">
          <Link href="/trips" aria-label="Back to your trips" className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken">
            <Icon name="back" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-accent">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
              </span>
              {sharedOk.length ? "Sharing live" : `${noun[0].toUpperCase()}${noun.slice(1)} in progress`}
            </p>
            <h1 className="truncate font-extrabold">{trip.autoArrival ? `To ${trip.destination.name}${modeLine ? ` · ${modeLine}` : ""}` : "Sharing where you are"}</h1>
          </div>
        </div>
        <div className="pointer-events-auto mx-auto mt-2 flex max-w-xl justify-end">
          <EmergencyPill />
        </div>
      </div>

      <BottomSheet snap={snap} onSnap={setSnap} label="Journey controls">
        {netDown ? (
          <div role="alert" className="mb-4 rounded-3xl bg-warm-soft p-4">
            <p className="font-extrabold text-warm">Missed-arrival checks are paused</p>
            <p className="mt-1 text-sm text-ink-muted">MIRA&apos;s background service isn&apos;t responding, so nobody would be told if you don&apos;t arrive. Send your live link, or let someone know directly.</p>
          </div>
        ) : null}
        {gps !== "ok" || uploadFailing ? (
          <div role="status" className="mb-4 rounded-3xl bg-warm-soft p-4">
            <p className="font-extrabold text-warm">{gps === "denied" ? "Location is off for MIRA" : gps === "lost" ? "Can't get your location right now" : "Can't reach MIRA right now"}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {sharedOk.length ? "Your contacts are seeing your last spot. " : ""}
              {gps === "denied" ? "Turn location back on for this site in your browser settings." : gps === "lost" ? "It usually comes back once you're outdoors or have signal." : "Check your connection — MIRA keeps trying."}
              {alertsOn ? " If you don't arrive, they're still emailed after your ETA." : ""}
            </p>
          </div>
        ) : null}
        {trip.sharedWith.some((c) => !c.notified) ? (
          <div role="status" className="mb-4 rounded-3xl bg-warm-soft p-4">
            <p className="font-extrabold text-warm">
              Couldn&apos;t email your link to {names(trip.sharedWith.filter((c) => !c.notified).map((c) => c.name))}
            </p>
            <p className="mt-1 text-sm text-ink-muted">Tap &ldquo;Send my live link&rdquo; to send it yourself.</p>
          </div>
        ) : null}
        {trip.state === "missed" ? (
          <div role="alert" className="mb-4 rounded-3xl bg-warm-soft p-4">
            <p className="font-extrabold">Are you okay? Tap &ldquo;I&apos;m here&rdquo; if you&apos;ve arrived.</p>
            <p className="mt-1 text-sm text-ink-muted">
              {trip.alert === "sent"
                ? "I've let your contacts know you haven't checked in."
                : trip.alert === "claimed"
                  ? "I'm letting your contacts know now…"
                  : trip.alert === "failed" || trip.alert === "unconfirmed"
                    ? "I tried to reach your contacts but couldn't confirm the message went out."
                    : "Nobody was notified — either no contact on this trip has accepted your invite, or email isn't available right now."}{" "}
              If you&apos;re in danger, <EmergencyPill variant="link" />.
            </p>
          </div>
        ) : null}

        {/* 1. Where and when: destination, ETA in her local time, how far. */}
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-ink-subtle">{trip.autoArrival ? (left > 0 ? "Expected in" : "Expected") : "Sharing for"}</p>
          <p className="text-4xl font-extrabold tabular-nums">{!clock ? "…" : left > 0 ? span : mins < 1 ? "now" : `${span} ago`}</p>
          <p className="text-ink-muted">
            {trip.autoArrival ? (clock ? `ETA ${time(trip.etaAt)}` : "ETA") : clock ? `Until ${time(trip.etaAt)}` : ""}
            {distance !== null && trip.autoArrival ? ` · ${distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1)} km`} to go` : ""}
          </p>
          {walking && route ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-subtle">
              <Icon name="route" className="size-4" /> Your planned route stays on this phone
              {aheadCount ? ` · ${aheadCount} Help Point${aheadCount === 1 ? "" : "s"} along it` : ""}
            </p>
          ) : null}
        </div>

        {/* 2. The main actions: arrive, share. */}
        <div className="mt-5 grid gap-3">
          {trip.autoArrival ? (
            <Button variant="hero" size="lg" onClick={() => act("arrive")} busy={busy === "arrive"} busyLabel="Saving…">
              <Icon name="check" /> I&apos;m here
            </Button>
          ) : (
            <Button variant="hero" size="lg" onClick={() => act("arrive")} busy={busy === "arrive"} busyLabel="Stopping…">
              <Icon name="check" /> I&apos;m okay — stop sharing
            </Button>
          )}
          <Button variant={sharedOk.length ? "secondary" : "primary"} size="lg" onClick={share} disabled={!trip.shareUrl}>
            <Icon name="share" className="size-5" /> Send my live link
          </Button>
        </div>

        {/* 3. Who's following, and what happens if she doesn't arrive — plainly. */}
        <div className="mt-4 flex items-start gap-3 rounded-3xl bg-sunken p-4">
          {sharedOk.length ? (
            <div className="flex shrink-0 -space-x-2" aria-hidden>
              {sharedOk.slice(0, 3).map((c) => (
                <Avatar key={c.name} name={c.name} size={34} className="ring-2 ring-sunken" />
              ))}
            </div>
          ) : (
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface">
              <Icon name="share" className="size-4 text-ink-muted" />
            </span>
          )}
          <p className="text-sm text-ink-muted">
            <span className="block font-semibold text-ink">{sharedOk.length ? `${names(sharedOk.map((c) => c.name))} can see where you are until you ${trip.autoArrival ? "arrive" : "stop sharing"}.` : "Only people you send your live link to can follow."}</span>{" "}
            {alertsOn
              ? `If you haven't ${trip.autoArrival ? "arrived" : "checked in"} ${Math.round(MISS_GRACE_MS / 60_000)} min after ${trip.autoArrival ? "your ETA" : "your sharing time ends"}, MIRA emails ${sharedOk.length === 1 ? "them" : "them all"}.`
              : !emailAlerts
                ? "Nobody is alerted automatically if you don't arrive — MIRA can't send email alerts yet. Your live link is how people follow you."
                : netDown
                  ? "Nobody is alerted automatically right now — missed-arrival checks are paused."
                  : "Nobody is alerted automatically if you don't arrive — add someone in Circle for that."}
          </p>
        </div>

        {/* 4. If something feels wrong, or she needs longer. */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setUnsafe(true)} className="border-accent/40 font-extrabold text-accent-strong">
            I feel unsafe
          </Button>
          <Button variant="secondary" onClick={() => act("extend")} busy={busy === "extend"} disabled={trip.extended || trip.state !== "active"}>
            <Icon name="clock" className="size-4" /> {trip.extended ? "Extended" : "+10 min"}
          </Button>
        </div>
        {trip.checkRequestedAt && clock && clock.getTime() - new Date(trip.checkRequestedAt).getTime() < 30 * 60_000 ? (
          <p role="status" className="mt-3 rounded-2xl bg-mint-soft px-4 py-3 text-sm">
            You asked {sharedOk.length ? names(sharedOk.map((c) => c.name)) : "your people"} to check on you at {time(trip.checkRequestedAt)}. MIRA didn&apos;t contact anyone else.
          </p>
        ) : null}

        {/* The nearest Help Point, ranked for right now */}
        {focus ? (
          <div className="mt-3 rounded-3xl bg-accent-soft p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-2xl">{HELP_CLASSES[focus.cls].emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{focus.name}</p>
                <p className="text-sm text-ink-muted">
                  {HELP_CLASSES[focus.cls].label} · about {focus.minutes} min walk · {hoursLine(focus)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">{HELP_CLASSES[focus.cls].staffing}. MIRA can&apos;t confirm who&apos;s there right now.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setFocus(null)} className="grid size-11 shrink-0 place-items-center rounded-full bg-surface">
                <Icon name="close" className="size-4" />
              </button>
            </div>
            <a href={directions(focus)} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface text-sm font-bold text-accent-strong">
              Directions in Maps <Icon name="arrow" className="size-4" />
            </a>
          </div>
        ) : nextHelp ? (
          <button type="button" onClick={() => setFocus(nextHelp)} className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-3xl px-4 py-2 text-left hover:bg-sunken">
            <span aria-hidden className="text-xl">{HELP_CLASSES[nextHelp.cls].emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">Nearest Help Point{nextHelp.ahead ? " ahead" : ""}</span>
              <span className="block truncate font-semibold">
                {nextHelp.name} <span className="font-normal text-ink-muted">· {HELP_CLASSES[nextHelp.cls].label} · {nextHelp.minutes} min</span>
              </span>
            </span>
            <Icon name="chevron" className="size-4" />
          </button>
        ) : null}

        <p className="mt-4 text-sm text-ink-muted">
          {awake ? "MIRA is keeping your screen on. " : ""}
          Your location updates while this screen is open.{" "}
          {sharedOk.length ? "If you close MIRA, they'll see your last spot. " : ""}
          {trip.autoArrival ? <>Tap &ldquo;I&apos;m here&rdquo; when you arrive if MIRA hasn&apos;t noticed.</> : null}
        </p>

        <div className="mt-5">
          {confirmEnd ? (
            <div className="rounded-3xl bg-sunken p-4">
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
          ) : (
            <button type="button" onClick={() => setConfirmEnd(true)} className="min-h-11 w-full rounded-full text-sm font-bold text-ink-muted hover:bg-sunken">
              End trip without arriving
            </button>
          )}
        </div>
      </BottomSheet>

      <UnsafeSheet
        open={unsafe}
        onClose={() => setUnsafe(false)}
        me={me}
        helpPoints={help?.points ?? []}
        helpLoading={!help}
        helpFailed={Boolean(help?.failed)}
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
                names: sharedOk.length ? sharedOk.map((c) => c.name) : ["your trusted contacts"],
                onTell: async () => {
                  const r = await api<{ told: string[]; failed: string[]; trip: TripView }>(`/api/trips/${trip.id}/checkon`, { body: {} });
                  if (!r.ok) return { error: r.message };
                  setTrip(r.data.trip);
                  return { told: r.data.told, failed: r.data.failed };
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
