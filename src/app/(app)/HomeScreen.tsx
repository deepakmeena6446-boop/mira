"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/map/WorldMap";
import { BottomSheet, type Snap } from "@/components/app/BottomSheet";
import { Avatar } from "@/components/app/Avatar";
import { Chip } from "@/components/app/Chip";
import { SignInSheet } from "@/components/app/SignInSheet";
import { SearchOverlay, type Destination } from "@/components/app/SearchOverlay";
import { kindEmoji } from "@/components/app/kinds";
import { LightingSummary } from "@/components/app/LightingSummary";
import { HelpPointList, RouteContextLines } from "@/components/app/HelpPointList";
import { RouteOptions, type RouteOption } from "@/components/app/RouteOptions";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { UnsafeSheet, type UnsafeShareAction, type UnsafeTellAction } from "@/components/app/UnsafeSheet";
import { HelpNearSheet } from "@/components/app/HelpNearSheet";
import { HELP_CLASSES, dedupeHelpPoints, type HelpClass, type HelpPoint } from "@/domain/help-points";
import { setLocale, type ClientLocale } from "@/lib/locale-store";
import { InstallCard } from "@/components/pwa/InstallCard";
import { useFlag } from "@/lib/flags";
import { useOverlay } from "@/lib/use-overlay";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import { shareLiveLink } from "@/lib/share";
import { keepTripRoute } from "@/lib/trip-route";
import { greetingFor, setArea, setPendingReportSpot, takePendingDestination, useClock, useLocation, watchWhileVisible, type PickedSpot } from "@/lib/location-store";
import type { SavedPlace } from "@/server/account/places";
import type { Contact } from "@/server/account/contacts";
import type { TripView } from "@/server/trips";

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
type Mode = "walk" | "ride" | "transit";
const MODES: Array<[Mode, string]> = [
  ["walk", "Walk"],
  ["ride", "Auto / cab"],
  ["transit", "Metro / bus"],
];
const ETA_CHOICES = [10, 20, 30, 45, 60, 90];
interface RouteInfo extends RouteOption {
  notes: Note[];
  alternatives: RouteOption[];
}

/** The greeting card + help row on top, the sheet below: frame the map in what is visible between. */
const MAP_PADDING = { top: 170, bottom: 360, left: 40, right: 40 };
const fmtM = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  /** Whether MIRA can email trusted contacts at all (production SMTP configured). */
  emailAlerts: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  // Ask for location only once the welcome screen has explained why (a surprise prompt gets "Don't allow").
  const welcomed = useFlag("mira.welcomed");
  const loc = useLocation(Boolean(user) || welcomed.value);
  const lat = loc.point?.lat;
  const lon = loc.point?.lon;
  const me = useMemo(() => (lat !== undefined && lon !== undefined ? { lat, lon } : null), [lat, lon]);
  const now = useClock();
  const [initialDest] = useState(() => takePendingDestination());
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
  const [nearHelp, setNearHelp] = useState<{ key: string; points: HelpPoint[]; failed: boolean } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [places, setPlaces] = useState(initialPlaces);
  const [dest, setDest] = useState<Destination | null>(initialDest);
  const [routed, setRouted] = useState<{ key: string; data: RouteInfo | null; code?: string } | null>(null);
  const [option, setOption] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [snap, setSnap] = useState<Snap>(initialDest ? "half" : "peek");
  const [signIn, setSignIn] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const [nearOpen, setNearOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("walk");
  const [etaMin, setEtaMin] = useState(30);
  const exclude = useMemo(() => (user?.helpExclude ?? []) as HelpClass[], [user?.helpExclude]);
  const accepted = contacts.filter((c) => c.status === "accepted" && c.isDefault);
  const [shareWithCircle, setShareWithCircle] = useState(true);

  // First visit: show the short onboarding once (per-device convenience flag only).
  useEffect(() => {
    if (user) return;
    try {
      if (!localStorage.getItem("mira.welcomed")) router.replace("/welcome");
    } catch {
      /* storage unavailable: stay on home */
    }
  }, [user, router]);

  // Keep the dot live while Home is on screen (paused when the app is hidden).
  const located = loc.status === "ok";
  useEffect(() => (located ? watchWhileVisible() : undefined), [located]);
  // Locality from the map tiles ("Kamla Nagar"), else the nearest named place we know.
  const area = loc.area ?? poiArea;

  // Where am I, what's around, and the Help Points near me (fetched ahead, so "I feel unsafe" is instant).
  const meKey = me ? `${me.lat.toFixed(3)},${me.lon.toFixed(3)}` : "";
  useEffect(() => {
    if (!me) return;
    let stop = false;
    (async () => {
      const [r, n, h] = await Promise.all([
        api<{ label: string | null; locale?: ClientLocale }>("/api/geo/reverse", { body: me }),
        api<{ places: Place[]; notes: Note[] }>("/api/geo/nearby", { body: me }),
        api<{ helpPoints: HelpPoint[] }>("/api/geo/help", { body: me }),
      ]);
      if (stop) return;
      if (r.ok) {
        setPoiArea(r.data.label);
        setLocale(r.data.locale); // emergency number + helplines for where she is
      }
      if (n.ok) setNearby(n.data);
      setNearbyFailed(!n.ok);
      setNearHelp({ key: meKey, points: h.ok ? h.data.helpPoints : [], failed: !h.ok });
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  const pick = useCallback((d: Destination) => {
    setSearchOpen(false);
    setPinMode(false);
    setDest(d);
    setOption(0);
    setMode("walk");
    setSnap("half");
  }, []);

  // Route options for the chosen destination from where I am (derived; refetches if either changes).
  const routeKey = dest && me ? `${dest.lat},${dest.lon}|${meKey}` : null;
  useEffect(() => {
    if (!routeKey || !dest || !me) return;
    let stop = false;
    void api<RouteInfo>("/api/geo/route", { body: { from: me, to: { lat: dest.lat, lon: dest.lon } } }).then((res) => {
      if (stop) return;
      setRouted({ key: routeKey, data: res.ok ? res.data : null, code: res.ok ? undefined : res.code });
      if (!res.ok && res.code === "too_far") setMode("ride"); // too far to walk: she's probably riding
    });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  const info = routed && routed.key === routeKey ? routed.data : null;
  const routeLoading = Boolean(routeKey) && routed?.key !== routeKey;
  // Her Help Point filters apply everywhere (e.g. no police), before any count or list.
  const options: RouteOption[] = useMemo(
    () =>
      (info ? [{ route: info.route, lighting: info.lighting, helpPoints: info.helpPoints ?? [] }, ...(info.alternatives ?? [])] : []).map((o) => ({ ...o, helpPoints: o.helpPoints.filter((p) => !exclude.includes(p.cls)) })),
    [info, exclude],
  );
  const chosen = options[Math.min(option, options.length - 1)] ?? null;

  // Pins: what's around you, or the Help Points along the chosen way once a destination is picked.
  const mapPlaces = useMemo(
    () =>
      dest
        ? (chosen?.helpPoints ?? []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, emoji: HELP_CLASSES[p.cls].emoji }))
        : nearby.places.slice(0, 20).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, emoji: kindEmoji(p.kind) })),
    [dest, chosen, nearby.places],
  );
  const onPlaceClick = useCallback(
    (p: { name: string; lat: number; lon: number; id: string }) => {
      const hit = nearby.places.find((x) => x.id === p.id);
      const help = chosen?.helpPoints.find((x) => x.id === p.id);
      pick({ name: p.name, lat: p.lat, lon: p.lon, kind: hit?.kind ?? (help ? HELP_CLASSES[help.cls].label : undefined) });
    },
    [nearby.places, chosen, pick],
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
  const sharesWithCircle = Boolean(emailAlerts && accepted.length && shareWithCircle);

  /** Start a journey (her tap, always). `to` defaults to the destination on screen. */
  const startTrip = async (to?: { name: string; lat: number; lon: number }) => {
    if (!user) return setSignIn("Sign in to start with MIRA");
    const target = to ?? dest;
    if (!target || !me || starting) return;
    const picked = !to && option > 0 ? chosen : null;
    setStarting(true);
    const walking = to || mode === "walk";
    const res = await api<{ trip: TripView }>("/api/trips", {
      body: {
        from: me,
        to: { lat: target.lat, lon: target.lon, name: target.name.slice(0, 80) },
        share: sharesWithCircle,
        ...(walking ? (picked ? { routeMinutes: picked.route.minutes } : {}) : { mode, etaMinutes: etaMin }),
      },
    });
    setStarting(false);
    if (res.ok) {
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

  // "I feel unsafe": the share action depends on what's already known — never asks for anything MIRA has.
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
      ? { label: "Share my journey live", detail: "Sign in with just your first name, then send a live link to anyone.", onShare: () => (setUnsafe(false), setSignIn("Sign in to start with MIRA")) }
      : dest || home
        ? {
            label: `Share my walk to ${dest ? dest.name : home!.label}`,
            detail: "Starts a live journey now. Then send the link to anyone you choose.",
            onShare: () => {
              setUnsafe(false);
              void startTrip(dest ? undefined : { name: home!.label, lat: home!.lat, lon: home!.lon });
            },
          }
        : { label: "Share my journey live", detail: "Choose where you're going, then send a live link to anyone.", onShare: () => (setUnsafe(false), setSearchOpen(true)) };
  // "Tell my people now": emails her accepted contacts at once. With no journey running, it first
  // starts one that just shares where she is (no destination), so they have a live link to open.
  const tellAction: UnsafeTellAction | null =
    user && emailAlerts && accepted.length && me
      ? {
          names: accepted.map((c) => c.name),
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
            const t = await api<{ told: string[]; failed: string[] }>(`/api/trips/${tripId}/checkon`, { body: {} });
            router.refresh();
            return t.ok ? t.data : { error: t.message };
          },
        }
      : null;
  const unsafeHelp = useMemo(() => dedupeHelpPoints([...(chosen?.helpPoints ?? []), ...(nearHelp?.points ?? [])]), [chosen, nearHelp]);

  const circleLine = !user ? (
    <>Send a live link to anyone when you start.</>
  ) : !emailAlerts ? (
    <>Send a live link to anyone when you start. Email alerts aren&apos;t switched on yet, so nobody is alerted automatically.</>
  ) : accepted.length ? (
    <>
      <Icon name="check" className="mr-1 inline size-4 text-mint" />
      {names(accepted.map((c) => c.name))} get your live link by email when you share.
    </>
  ) : invited.length ? (
    <>Waiting for {names(invited.map((c) => c.name))} to accept your email invite. Until then, send a live link yourself.</>
  ) : (
    <>
      Send a live link to anyone when you start.{" "}
      <Link href="/circle" className="font-bold text-accent">
        Add someone
      </Link>{" "}
      to be emailed if you don&apos;t arrive.
    </>
  );

  const nudge = useMemo(() => {
    if (activeTrip || !user) return null;
    if (g?.late && home && me) return { text: `Heading home, ${firstName}?`, cta: `Take me ${home.label === "Home" ? "home" : "to " + home.label}`, action: () => pick({ name: home.label, lat: home.lat, lon: home.lon }) };
    if (!home) return { text: "Save Home once, and the walk back is one tap.", cta: "Find it", action: () => setSearchOpen(true) };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, g?.late, home, me, activeTrip]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <h1 className="sr-only">MIRA — where are you going?</h1>
      <WorldMap tiles={tiles} me={me} dest={dest} route={mode === "walk" ? (chosen?.route.geometry ?? null) : null} notes={[]} places={mapPlaces} recenter={recenter} lighting={chosen?.lighting?.segments ?? null} onPlaceClick={onPlaceClick} onLongPress={onLongPress} onMapClick={onMapClick} onArea={setArea} label="Map around your location" padding={MAP_PADDING} />

      {/* Top: greeting, and help that's always one tap away */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto max-w-xl">
          <div className="glass flex items-center gap-3 rounded-[1.6rem] border border-glass-edge px-4 py-3 shadow-[var(--shadow-card)] animate-rise">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[clamp(1rem,4.6vw,1.125rem)] font-extrabold leading-tight">
                {g ? `${g.hello}${firstName ? `, ${firstName}` : ""} ${g.emoji}` : " "}
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
                  {unread ? <span aria-hidden className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-extrabold leading-4 text-accent-ink">{unread > 9 ? "9+" : unread}</span> : null}
                </Link>
                <Link href="/me" aria-label="Your profile">
                  <Avatar name={user.name} src={user.avatarUrl} size={42} />
                </Link>
              </>
            ) : (
              <button type="button" onClick={() => setSignIn("Let's get you set up")} className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-ink">
                Sign in
              </button>
            )}
          </div>
          <div className="mt-2 flex justify-end gap-2 animate-rise">
            <button type="button" onClick={() => setUnsafe(true)} className="min-h-11 rounded-full bg-surface px-4 text-sm font-extrabold text-accent-strong shadow-[var(--shadow-card)]">
              I feel unsafe
            </button>
            <EmergencyPill />
          </div>
          {loc.status === "denied" || loc.status === "unavailable" ? (
            <button type="button" onClick={() => loc.request()} className="mt-2 w-full rounded-2xl bg-warm-soft px-4 py-2.5 text-left text-sm font-semibold text-warm">
              {loc.status === "denied"
                ? "Location is off for MIRA, so it can't show the way from here or Help Points near you. Allow it in your browser's site settings (the icon next to the address), then tap here. Search still works."
                : "Can't find you right now → Tap to try again"}
            </button>
          ) : null}
          {pinMode ? (
            <div className="pointer-events-auto mt-2 flex items-center gap-2 rounded-2xl bg-ink py-1.5 pl-4 pr-1.5 text-sm font-semibold text-canvas">
              <span className="flex-1">Tap the map to choose a spot</span>
              <button type="button" onClick={() => setPinMode(false)} className="min-h-11 rounded-xl px-3 font-bold underline">
                Cancel
              </button>
            </div>
          ) : null}
          {pressed ? (
            <div role="dialog" aria-label="This spot" className={cx("mt-2.5 rounded-3xl border border-line bg-surface p-4 shadow-[var(--shadow-float)] animate-rise", pressArmed ? "pointer-events-auto" : "pointer-events-none")}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-xl">📍</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{pressed.name ?? "This spot"}</p>
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
                    router.push("/report");
                  }}
                  className="min-h-12 rounded-2xl bg-peach-soft px-3 text-sm font-bold text-ink"
                >
                  🚩 Report here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pick({ name: pressed.name ?? "Dropped pin", lat: pressed.lat, lon: pressed.lon });
                    setPressed(null);
                  }}
                  className="min-h-12 rounded-2xl bg-accent-soft px-3 text-sm font-bold text-accent-strong"
                >
                  🧭 Walk here
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {me ? (
        <button
          type="button"
          aria-label="Centre on my location"
          onClick={() => {
            setRecenter((n) => n + 1); // fly back to you, even if the fix hasn't changed
            void loc.request();
          }}
          className="absolute right-4 z-20 grid size-12 place-items-center rounded-full bg-surface text-accent shadow-[var(--shadow-float)]"
          style={{ bottom: snap === "peek" ? "calc(40dvh + 1rem)" : "calc(55dvh + 1rem)" }}
        >
          <Icon name="locate" />
        </button>
      ) : null}

      <BottomSheet snap={snap} onSnap={setSnap} label={dest ? `Route to ${dest.name}` : "Where are you going?"}>
        {activeTrip ? (
          <Link href="/trip" className="mb-4 flex items-center gap-3 rounded-3xl bg-mira p-4 text-white shadow-[var(--shadow-float)]">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-70" />
              <span className="relative inline-flex size-3 rounded-full bg-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{activeTrip.state === "missed" ? "Are you okay?" : `On your way to ${activeTrip.destination.name}`}</span>
              <span className="block text-sm text-white/85">
                {now ? `ETA ${clock(new Date(activeTrip.etaAt))} · ` : ""}
                {activeTrip.sharedWith.some((c) => c.notified) ? `${activeTrip.sharedWith.filter((c) => c.notified).map((c) => c.name).join(", ")} following` : "Only people you send the link to can follow"}
              </span>
            </span>
            <Icon name="chevron" />
          </Link>
        ) : null}

        {dest ? (
          <div className="animate-rise">
            <div className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl">{kindEmoji(dest.kind ?? "")}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-extrabold text-mixed">{dest.name}</h2>
                {mode !== "walk" ? (
                  <p className="text-ink-muted">
                    <strong className="text-ink">{MODES.find((m) => m[0] === mode)?.[1]}</strong> · expected in {etaMin < 60 ? `${etaMin} min` : etaMin === 90 ? "1 h 30" : `${etaMin / 60} h`}
                  </p>
                ) : routeLoading ? (
                  <p className="text-ink-muted">Finding the way…</p>
                ) : routed?.code === "too_far" ? (
                  <p className="text-ink-muted">Too far to walk — choose how you&apos;re going.</p>
                ) : chosen ? (
                  <p className="text-ink-muted">
                    <strong className="text-ink">{chosen.route.minutes} min</strong> walk · {fmtM(chosen.route.meters)}
                    {now ? ` · arrive around ${clock(new Date(now.getTime() + chosen.route.minutes * 60_000))}` : ""}
                    {chosen.route.approximate ? <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold">approx.</span> : null}
                  </p>
                ) : !me ? (
                  <p className="text-ink-muted">Turn on location to see the walk from here.</p>
                ) : routed ? (
                  <p className="text-ink-muted">Couldn&apos;t get the walking time — you can still start with MIRA.</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setDest(null);
                  setSnap("peek");
                }}
                className="grid size-11 place-items-center rounded-full bg-sunken"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-full bg-sunken p-1" role="radiogroup" aria-label="How are you going?">
              {MODES.map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cx("min-h-10 rounded-full text-sm font-bold", mode === m ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-muted")}>
                  {label}
                </button>
              ))}
            </div>

            {mode !== "walk" ? (
              <div className="mt-3">
                <p className="text-sm font-semibold">When do you expect to get there?</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Expected in">
                  {ETA_CHOICES.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={etaMin === m} onClick={() => setEtaMin(m)} className={cx("min-h-11 rounded-full border-2 px-4 text-sm font-bold", etaMin === m ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-muted")}>
                      {m < 60 ? `${m} min` : m === 90 ? "1 h 30" : `${m / 60} h`}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  MIRA uses the time you choose{now ? ` (around ${clock(new Date(now.getTime() + etaMin * 60_000))})` : ""}. Lighting and Help Points on the way are for walking routes; Help Points near you are in &ldquo;I feel unsafe&rdquo;.
                </p>
              </div>
            ) : null}

            {/* What's known about getting there (short), then the way to start, then the details. */}
            {mode !== "walk" ? null : routeLoading ? (
              <p className="mt-3 text-sm text-ink-muted">Checking lighting and Help Points along the way…</p>
            ) : options.length > 1 ? (
              <RouteOptions options={options} selected={option} onSelect={setOption} />
            ) : chosen && !chosen.route.approximate ? (
              <RouteContextLines option={chosen} />
            ) : null}

            <div className="mt-4">
              <Button variant="hero" size="lg" onClick={() => void startTrip()} busy={starting} busyLabel="Starting…" disabled={!me}>
                <Icon name="walk" /> Start with MIRA
              </Button>
              {user && emailAlerts && accepted.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who follows this journey">
                  {[
                    [true, `Share with ${names(accepted.map((c) => c.name))}`],
                    [false, "Just me"],
                  ].map(([v, label]) => (
                    <button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={shareWithCircle === v}
                      onClick={() => setShareWithCircle(v as boolean)}
                      className={cx("min-h-11 truncate rounded-full border-2 px-3 text-sm font-bold", shareWithCircle === v ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-muted")}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-center text-xs text-ink-muted">
                {!user
                  ? "Sign in with your first name. Then you can send a live link to anyone, and it ends itself when you arrive."
                  : sharesWithCircle
                    ? `${names(accepted.map((c) => c.name))} get your live link by email now, and an email if you don't arrive.`
                    : accepted.length && emailAlerts
                      ? "Nobody is alerted if you don't arrive. You can still send your live link on the next screen."
                      : "Nobody is alerted automatically. On the next screen, send your live link on WhatsApp or SMS — it stops when you arrive."}
              </p>
            </div>

            {mode === "walk" && chosen && !chosen.route.approximate ? (
              <>
                {chosen.lighting ? <LightingSummary lighting={chosen.lighting} /> : null}
                <HelpPointList points={chosen.helpPoints} defaultOpen onPick={(p) => pick({ name: p.name, lat: p.lat, lon: p.lon, kind: HELP_CLASSES[p.cls].label })} />
              </>
            ) : null}
            {info?.notes.length ? (
              <section className="mt-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Community notes on this route</h3>
                <ul className="mt-2 space-y-2">
                  {info.notes.map((n) => (
                    <li key={n.id} className="rounded-2xl bg-sunken px-4 py-3 text-sm">
                      <p>{n.text}</p>
                      <details className="mt-1 text-xs text-ink-muted">
                        <summary className="min-h-8 cursor-pointer font-semibold">{n.week ? `Week of ${new Date(n.week).toLocaleDateString([], { day: "numeric", month: "short" })} · ` : ""}Why am I seeing this?</summary>
                        <p className="mt-1">At least five different people privately reported something similar in this ~1 km area at this time of day, and a person reviewed each report. It&apos;s shown in fixed words, without counts or exact places, and disappears after five weeks. It isn&apos;t a rating of the area.</p>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {user ? (
              <section className="mt-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Save this place</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip disabled={saving !== null} onClick={() => savePlace("Home", "🏠")}>🏠 Home</Chip>
                  <Chip disabled={saving !== null} onClick={() => savePlace("College", "🎓")}>🎓 College</Chip>
                  <Chip disabled={saving !== null} onClick={() => savePlace("Work", "💼")}>💼 Work</Chip>
                  <Chip disabled={saving !== null} onClick={() => savePlace(dest.name.slice(0, 40), "⭐")}>⭐ Favourite</Chip>
                </div>
              </section>
            ) : null}
            {chosen?.route.approximate ? (
              <p className="mt-4 text-xs text-ink-subtle">Walking time is an estimate from a straight line: there&apos;s no street map for this area yet, so lighting and Help Points along the way aren&apos;t known.</p>
            ) : null}
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Where are you going?</h2>
            <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
              {places.map((p) => (
                <Chip key={p.id} onClick={() => pick({ name: p.label, lat: p.lat, lon: p.lon })}>
                  {p.emoji} {p.label}
                </Chip>
              ))}
              <Chip onClick={() => (user ? setSearchOpen(true) : setSignIn("Sign in to save places"))} ariaLabel="Add a place">
                <Icon name="plus" className="size-4" /> {places.length ? "Add" : "Add a place"}
              </Chip>
            </div>
            <button type="button" onClick={() => setSearchOpen(true)} className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-full bg-surface px-5 text-left text-lg font-semibold text-ink-subtle shadow-[var(--shadow-card)]">
              <Icon name="know" className="size-5 text-accent" /> Search a place or address
            </button>
            <p className="mt-3 text-sm text-ink-muted">{circleLine}</p>

            {nudge ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[var(--shadow-card)] animate-rise">
                <p className="min-w-0 flex-1 text-sm font-semibold">{nudge.text}</p>
                <button type="button" onClick={nudge.action} className="min-h-11 shrink-0 rounded-full bg-accent-soft px-4 text-sm font-bold text-accent-strong">
                  {nudge.cta}
                </button>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-x-4 text-sm">
              <button type="button" onClick={() => setNearOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-accent">
                <Icon name="pin" className="size-4" /> Help Points near me
              </button>
              <Link href="/mira" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-accent">
                <Icon name="sparkle" className="size-4" /> Ask Mira
              </Link>
              <Link href="/report" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-ink-muted">
                <Icon name="flag" className="size-4" /> Report something
              </Link>
            </div>

            {user && !installDismissed.value ? <InstallCard variant="card" onDismiss={installDismissed.set} /> : null}

            <section className="mt-5" aria-label="Around you">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Around you</h2>
              {!me ? (
                <p className="mt-2 text-ink-muted">{loc.status === "asking" ? "Finding where you are…" : "Turn on location to see what's nearby."}</p>
              ) : nearbyFailed ? (
                <p className="mt-2 text-ink-muted">Couldn&apos;t load what&apos;s around you — check your connection.</p>
              ) : nearby.places.length === 0 ? (
                <p className="mt-2 text-ink-muted">No detailed places for this area yet. Search or drop a pin to plan a walk.</p>
              ) : (
                <>
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
                    {nearby.places.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => pick({ name: p.name, lat: p.lat, lon: p.lon, kind: p.kind })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
                          <span className="text-xl" aria-hidden>
                            {kindEmoji(p.kind)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-mixed">{p.name}</span>
                            <span className="block truncate text-xs text-ink-muted">
                              {p.kind}
                              {p.hours ? ` · Listed hours ${p.hours}` : ""}
                            </span>
                          </span>
                          <span className="text-sm text-ink-subtle">{p.distanceM !== undefined ? fmtM(p.distanceM) : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
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
        near={me}
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
