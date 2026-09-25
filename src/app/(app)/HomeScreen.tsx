"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/map/WorldMap";
import { BottomSheet, type Snap } from "@/components/app/BottomSheet";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Avatar } from "@/components/app/Avatar";
import { Chip } from "@/components/app/Chip";
import { SignInSheet } from "@/components/app/SignInSheet";
import { SearchOverlay, type Destination } from "@/components/app/SearchOverlay";
import { kindEmoji } from "@/components/app/kinds";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import { greetingFor, useLocation } from "@/lib/location-store";
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
  lat: number;
  lon: number;
}
interface RouteInfo {
  route: { meters: number; minutes: number; geometry: Array<[number, number]>; approximate: boolean };
  along: Place[];
  notes: Note[];
}

const fmtM = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export function HomeScreen({
  user,
  places: initialPlaces,
  contacts,
  trip,
  tiles,
}: {
  user: { id: string; name: string; avatarUrl: string | null } | null;
  places: SavedPlace[];
  contacts: Contact[];
  trip: TripView | null;
  tiles: { url: string; attribution: string; styleUrl?: string | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const loc = useLocation(true);
  const me = loc.point ? { lat: loc.point.lat, lon: loc.point.lon } : null;
  const [now, setNow] = useState<Date | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [nearby, setNearby] = useState<{ places: Place[]; notes: Note[] }>({ places: [], notes: [] });
  const [places, setPlaces] = useState(initialPlaces);
  const [dest, setDest] = useState<Destination | null>(null);
  const [info, setInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [snap, setSnap] = useState<Snap>("peek");
  const [signIn, setSignIn] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Where am I + what's around, whenever the position settles.
  const meKey = me ? `${me.lat.toFixed(3)},${me.lon.toFixed(3)}` : "";
  useEffect(() => {
    if (!me) return;
    let stop = false;
    (async () => {
      const [r, n] = await Promise.all([
        api<{ label: string }>("/api/geo/reverse", { body: me }),
        api<{ places: Place[]; notes: Note[] }>("/api/geo/nearby", { body: me }),
      ]);
      if (stop) return;
      if (r.ok) setArea(r.data.label);
      if (n.ok) setNearby(n.data);
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  const pick = useCallback(
    async (d: Destination) => {
      setSearchOpen(false);
      setPinMode(false);
      setDest(d);
      setInfo(null);
      setSnap("half");
      if (!me) return;
      setRouteLoading(true);
      const res = await api<RouteInfo>("/api/geo/route", { body: { from: me, to: { lat: d.lat, lon: d.lon } } });
      setRouteLoading(false);
      if (res.ok) setInfo(res.data);
    },
    [me],
  );

  const onMapClick = useCallback(
    async (p: { lat: number; lon: number }) => {
      if (!pinMode) return;
      const r = await api<{ label: string }>("/api/geo/reverse", { body: p });
      void pick({ name: r.ok ? r.data.label.replace(/^Near /, "Near ") : "Dropped pin", lat: p.lat, lon: p.lon });
    },
    [pinMode, pick],
  );

  const accepted = contacts.filter((c) => c.status === "accepted" && c.isDefault);
  const home = places.find((p) => /home|hostel|pg/i.test(p.label));
  const g = now ? greetingFor(now) : null;
  const firstName = user?.name.split(" ")[0];

  const nudge = useMemo(() => {
    if (trip && (trip.state === "active" || trip.state === "missed")) return null;
    if (!user) return { text: "Hi, I'm Mira. Tell me where you're headed and I'll help you share the trip with people you trust.", cta: "Get started", action: () => setSignIn("Hi! I'm Mira") };
    if (g?.late && home && me) return { text: `It's getting late, ${firstName}. Want me to share your walk to ${home.label}?`, cta: `Take me ${home.label === "Home" ? "home" : "to " + home.label}`, action: () => pick({ name: home.label, lat: home.lat, lon: home.lon }) };
    if (!home) return { text: "Save your home and I can share your walk back in one tap.", cta: "Save a place", action: () => router.push("/me#places") };
    if (!accepted.length) return { text: "Add someone you trust — they'll be able to follow your trips live when you share.", cta: "Add a contact", action: () => router.push("/me#contacts") };
    return { text: "Heading somewhere? I'll keep your people in the loop.", cta: "Where to?", action: () => setSearchOpen(true) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, g?.late, home, me, accepted.length, trip]);

  const startTrip = async () => {
    if (!user) return setSignIn("Sign in to share your trip");
    if (!dest || !me || starting) return;
    setStarting(true);
    const res = await api<{ trip: TripView }>("/api/trips", { body: { from: me, to: { lat: dest.lat, lon: dest.lon, name: dest.name.slice(0, 80) }, share: true } });
    setStarting(false);
    if (res.ok) {
      router.push("/trip");
      router.refresh();
    } else if (res.code === "trip_active") {
      router.push("/trip");
    } else {
      toast(res.message, "error");
    }
  };

  const savePlace = async (label: string, emoji: string) => {
    if (!user) return setSignIn("Sign in to save places");
    if (!dest) return;
    const res = await api<{ place: SavedPlace }>("/api/me/places", { body: { label, emoji, lat: dest.lat, lon: dest.lon, address: dest.name.slice(0, 160) } });
    if (res.ok) {
      setPlaces((p) => [...p, res.data.place]);
      toast(`Saved as ${label}`);
    } else toast(res.message, "error");
  };

  const activeTrip = trip && (trip.state === "active" || trip.state === "missed") ? trip : null;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <WorldMap tiles={tiles} me={me} dest={dest} route={info?.route.geometry ?? null} notes={nearby.notes} onMapClick={onMapClick} label="Map around your location" />

      {/* Top: greeting + search */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto max-w-xl">
          <div className="glass flex items-center gap-3 rounded-[1.6rem] border border-white/70 px-4 py-3 shadow-[var(--shadow-card)] animate-rise">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold leading-tight">
                {g ? `${g.hello}${firstName ? `, ${firstName}` : ""} ${g.emoji}` : " "}
              </p>
              <p className="truncate text-sm text-ink-muted">
                {now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
                {area ? ` · ${area}` : loc.status === "asking" ? " · Finding you…" : loc.status === "denied" ? " · Location off" : ""}
              </p>
            </div>
            {user ? (
              <Link href="/me" aria-label="Your profile">
                <Avatar name={user.name} src={user.avatarUrl} size={42} />
              </Link>
            ) : (
              <button type="button" onClick={() => setSignIn("Hi! I'm Mira")} className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-white">
                Sign in
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="mt-2.5 flex min-h-14 w-full items-center gap-3 rounded-full bg-surface px-5 text-left text-lg font-semibold text-ink-subtle shadow-[var(--shadow-float)] animate-rise"
          >
            <Icon name="know" className="size-5 text-accent" /> Where to?
          </button>
          {loc.status === "denied" || loc.status === "unavailable" ? (
            <button type="button" onClick={() => loc.request()} className="mt-2 w-full rounded-2xl bg-warm-soft px-4 py-2.5 text-left text-sm font-semibold text-warm">
              Turn on location so I can show where you are → Tap to try again
            </button>
          ) : null}
          {pinMode ? <p className="mt-2 rounded-2xl bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white">Tap the map to choose a spot</p> : null}
        </div>
      </div>

      {me ? (
        <button
          type="button"
          aria-label="Centre on my location"
          onClick={() => loc.request()}
          className="absolute right-4 z-20 grid size-12 place-items-center rounded-full bg-surface text-accent shadow-[var(--shadow-float)]"
          style={{ bottom: snap === "peek" ? "calc(40dvh + 1rem)" : "calc(55dvh + 1rem)" }}
        >
          <Icon name="locate" />
        </button>
      ) : null}

      <BottomSheet snap={snap} onSnap={setSnap} label={dest ? `Route to ${dest.name}` : "Around you"}>
        {activeTrip ? (
          <Link href="/trip" className="mb-4 flex items-center gap-3 rounded-3xl bg-mira p-4 text-white shadow-[var(--shadow-float)]">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-70" />
              <span className="relative inline-flex size-3 rounded-full bg-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{activeTrip.state === "missed" ? "Are you okay?" : `Sharing your trip to ${activeTrip.destination.name}`}</span>
              <span className="block text-sm text-white/85">
                ETA {new Date(activeTrip.etaAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {activeTrip.sharedWith.length ? `${activeTrip.sharedWith.map((c) => c.name).join(", ")} following` : "Private trip"}
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
                {routeLoading ? (
                  <p className="text-ink-muted">Finding the way…</p>
                ) : info ? (
                  <p className="text-ink-muted">
                    <strong className="text-ink">{info.route.minutes} min</strong> walk · {fmtM(info.route.meters)}
                    {info.route.approximate ? <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold">approx.</span> : null}
                  </p>
                ) : !me ? (
                  <p className="text-ink-muted">Turn on location to see the walk from here.</p>
                ) : null}
              </div>
              <button type="button" aria-label="Close" onClick={() => { setDest(null); setInfo(null); setSnap("peek"); }} className="grid size-11 place-items-center rounded-full bg-sunken">
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <div className="mt-4">
              <Button variant="hero" size="lg" onClick={startTrip} busy={starting} busyLabel="Starting…" disabled={!me || routeLoading}>
                <Icon name="share" /> {accepted.length || !user ? "Share my trip" : "Start my trip"}
              </Button>
              <p className="mt-2 text-center text-sm text-ink-muted">
                {!user
                  ? "Your people follow along live until you arrive."
                  : accepted.length
                    ? `${accepted.map((c) => c.name).join(", ")} will see you live until you arrive.`
                    : "No trusted contacts yet — I'll still check you arrive. "}
                {user && !accepted.length ? (
                  <Link href="/me#contacts" className="font-bold text-accent">
                    Add one
                  </Link>
                ) : null}
              </p>
            </div>

            {info?.along.length ? (
              <section className="mt-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Along the way</h3>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {info.along.slice(0, 8).map((p) => (
                    <span key={p.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-semibold shadow-[var(--shadow-card)]">
                      {kindEmoji(p.kind)} <span className="max-w-40 truncate">{p.name}</span>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
            {info?.notes.length ? (
              <section className="mt-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Community notes on this route</h3>
                <ul className="mt-2 space-y-2">
                  {info.notes.map((n) => (
                    <li key={n.id} className="rounded-2xl bg-peach-soft px-4 py-3 text-sm">{n.text}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {user ? (
              <section className="mt-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Save this place</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip onClick={() => savePlace("Home", "🏠")}>🏠 Home</Chip>
                  <Chip onClick={() => savePlace("College", "🎓")}>🎓 College</Chip>
                  <Chip onClick={() => savePlace("Work", "💼")}>💼 Work</Chip>
                  <Chip onClick={() => savePlace(dest.name.slice(0, 40), "⭐")}>⭐ Favourite</Chip>
                </div>
              </section>
            ) : null}
            {info && !info.route.approximate ? null : info ? (
              <p className="mt-4 text-xs text-ink-subtle">Walking time is an estimate. Detailed walking directions arrive when full maps are connected.</p>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {places.map((p) => (
                <Chip key={p.id} onClick={() => pick({ name: p.label, lat: p.lat, lon: p.lon })}>
                  {p.emoji} {p.label}
                </Chip>
              ))}
              <Chip onClick={() => (user ? setSearchOpen(true) : setSignIn("Sign in to save places"))} ariaLabel="Add a place">
                <Icon name="plus" className="size-4" /> {places.length ? "Add" : "Add a place"}
              </Chip>
            </div>

            {nudge ? (
              <div className="mt-4 flex gap-3 rounded-3xl bg-gradient-to-br from-accent-soft to-peach-soft p-4 animate-rise">
                <MiraOrb size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{nudge.text}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" onClick={nudge.action} className="min-h-10 rounded-full bg-accent px-4 text-sm font-bold text-white">
                      {nudge.cta}
                    </button>
                    <Link href="/mira" className="inline-flex min-h-10 items-center rounded-full bg-surface px-4 text-sm font-bold text-accent">
                      Talk to Mira
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="mt-5" aria-label="Around you">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Around you</h2>
              {!me ? (
                <p className="mt-2 text-ink-muted">{loc.status === "asking" ? "Finding where you are…" : "Turn on location to see what's nearby."}</p>
              ) : nearby.places.length === 0 && nearby.notes.length === 0 ? (
                <p className="mt-2 text-ink-muted">I don&apos;t have detailed places for this area yet. Search or drop a pin to plan a walk.</p>
              ) : (
                <>
                  {nearby.notes.length ? (
                    <ul className="mt-2 space-y-2">
                      {nearby.notes.slice(0, 2).map((n) => (
                        <li key={n.id} className="flex gap-2 rounded-2xl bg-peach-soft px-4 py-3 text-sm">
                          <span aria-hidden>💬</span> {n.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
                    {nearby.places.slice(0, 6).map((p) => (
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
      />
      <SignInSheet open={signIn !== null} reason={signIn ?? undefined} onClose={() => setSignIn(null)} />
    </div>
  );
}
