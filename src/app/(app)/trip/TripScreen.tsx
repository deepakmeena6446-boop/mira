"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/map/WorldMap";
import { BottomSheet, type Snap } from "@/components/app/BottomSheet";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Avatar } from "@/components/app/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import { setLocation } from "@/lib/location-store";
import type { TripView } from "@/server/trips";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(s));
}

export function TripScreen({ initial, tiles }: { initial: TripView; tiles: { url: string; attribution: string; styleUrl?: string | null } }) {
  const router = useRouter();
  const toast = useToast();
  const [trip, setTrip] = useState(initial);
  const [me, setMe] = useState(initial.lastLocation ? { lat: initial.lastLocation.lat, lon: initial.lastLocation.lon } : null);
  const [route, setRoute] = useState<Array<[number, number]> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [snap, setSnap] = useState<Snap>("half");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [awake, setAwake] = useState(false);
  const lastSent = useRef<{ at: number; lat: number; lon: number } | null>(null);
  const open = trip.state === "active" || trip.state === "missed";

  const refresh = useCallback(async () => {
    const r = await api<{ trip: TripView | null }>("/api/trips/current");
    if (r.ok && r.data.trip) setTrip(r.data.trip);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    const p = setInterval(refresh, 20_000);
    return () => {
      clearInterval(t);
      clearInterval(p);
    };
  }, [refresh]);

  // Route from where I am to the destination (once).
  useEffect(() => {
    if (!me || route) return;
    void api<{ route: { geometry: Array<[number, number]> } }>("/api/geo/route", { body: { from: me, to: { lat: trip.destination.lat, lon: trip.destination.lon } } }).then((r) => r.ok && setRoute(r.data.route.geometry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me !== null]);

  // Live location while the screen is open: throttled to 20 s or 50 m.
  useEffect(() => {
    if (!open || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setMe(p);
        setLocation({ ...p, accuracy: pos.coords.accuracy });
        const last = lastSent.current;
        if (last && Date.now() - last.at < 20_000 && haversine(last, p) < 50) return;
        lastSent.current = { at: Date.now(), ...p };
        const r = await api<{ arrived: boolean }>(`/api/trips/${trip.id}/location`, { body: { ...p, accuracy: Math.round(pos.coords.accuracy) } });
        if (r.ok && r.data.arrived) {
          toast("You made it! I've let your people know.");
          void refresh();
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [open, trip.id, refresh, toast]);

  // Keep the screen awake during a live trip (browsers pause location when hidden).
  useEffect(() => {
    if (!open) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
        setAwake(Boolean(lock));
      } catch {
        setAwake(false);
      }
    };
    void acquire();
    const onVis = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
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
    const text = `I'm walking to ${trip.destination.name}. Follow along live on MIRA:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My trip on MIRA", text, url: trip.shareUrl });
        return;
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard?.writeText(trip.shareUrl);
    toast("Live link copied");
  };

  const left = new Date(trip.etaAt).getTime() - now;
  const mins = Math.round(Math.abs(left) / 60_000);
  const distance = me ? haversine(me, trip.destination) : null;

  if (!open) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-32 text-center">
        <div className="animate-rise">
          <MiraOrb size={84} />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold animate-rise">
          {trip.state === "arrived" ? "You made it 🎉" : trip.state === "ended" ? "Trip ended" : "Trip closed"}
        </h1>
        <p className="mt-2 max-w-sm text-ink-muted animate-rise">
          {trip.state === "arrived" ? `Glad you're at ${trip.destination.name}. ${trip.sharedWith.length ? "Live sharing has stopped for everyone." : ""}` : "Live sharing is off."} Trip details are deleted
          {trip.purgeAt ? ` by ${time(trip.purgeAt)}` : " soon"}. I don&apos;t keep a history of where you&apos;ve been.
        </p>
        <Button className="mt-8 max-w-xs" variant="hero" size="lg" onClick={() => { router.push("/"); router.refresh(); }}>
          Back home
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <WorldMap tiles={tiles} me={me} dest={trip.destination} route={route} follow label={`Live map of your trip to ${trip.destination.name}`} padding={{ top: 120, bottom: 420, left: 40, right: 40 }} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto glass mx-auto flex max-w-xl items-center gap-3 rounded-[1.6rem] border border-white/70 px-4 py-3 shadow-[var(--shadow-card)]">
          <Link href="/" aria-label="Back to home" className="grid size-10 place-items-center rounded-full bg-sunken">
            <Icon name="back" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-accent">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
              </span>
              {trip.sharedWith.length ? "Sharing live" : "Trip in progress"}
            </p>
            <p className="truncate font-extrabold">To {trip.destination.name}</p>
          </div>
        </div>
      </div>

      <BottomSheet snap={snap} onSnap={setSnap} label="Trip controls">
        {trip.state === "missed" ? (
          <div className="mb-4 rounded-3xl bg-warm-soft p-4">
            <p className="font-extrabold">Are you okay? Tap &ldquo;I&apos;m here&rdquo; if you&apos;ve arrived.</p>
            <p className="mt-1 text-sm text-ink-muted">
              {trip.alert === "sent"
                ? "I've let your contacts know you haven't checked in."
                : trip.alert === "failed" || trip.alert === "unconfirmed"
                  ? "I tried to reach your contacts but couldn't confirm the message went out."
                  : "Nobody was notified — no trusted contact has accepted your invite yet."}{" "}
              If you&apos;re in danger, call 112.
            </p>
          </div>
        ) : null}

        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-ink-subtle">{left > 0 ? "Expected in" : "Expected"}</p>
            <p className="text-4xl font-extrabold tabular-nums">{left > 0 ? `${mins} min` : mins < 1 ? "now" : `${mins} min ago`}</p>
            <p className="text-ink-muted">
              ETA {time(trip.etaAt)}
              {distance !== null ? ` · ${distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1)} km`} to go` : ""}
            </p>
          </div>
          {trip.sharedWith.length ? (
            <div className="flex -space-x-2" aria-label={`Shared with ${trip.sharedWith.map((c) => c.name).join(", ")}`}>
              {trip.sharedWith.slice(0, 3).map((c) => (
                <Avatar key={c.name} name={c.name} size={38} className="ring-2 ring-white" />
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3">
          <Button variant="hero" size="lg" onClick={() => act("arrive")} busy={busy === "arrive"} busyLabel="Saving…">
            <Icon name="check" /> I&apos;m here
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => act("extend")} busy={busy === "extend"} disabled={trip.extended || trip.state !== "active"}>
              <Icon name="clock" className="size-4" /> {trip.extended ? "Extended" : "+10 min"}
            </Button>
            <Button variant="secondary" onClick={share} disabled={!trip.shareUrl}>
              <Icon name="share" className="size-4" /> Share link
            </Button>
          </div>
        </div>

        <p className="mt-4 text-sm text-ink-muted">
          {trip.sharedWith.length ? `${trip.sharedWith.map((c) => c.name).join(", ")} can see where you are until you arrive.` : "This trip is private. I'll still check that you arrive."}{" "}
          {awake ? "I'm keeping your screen on." : ""} If you close MIRA, they&apos;ll see your last spot — and I&apos;ll still check in at your ETA.
        </p>

        <div className="mt-5">
          {confirmEnd ? (
            <div className="rounded-3xl bg-sunken p-4">
              <p className="font-semibold">End the trip? Live sharing stops and I won&apos;t check in on you.</p>
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
    </div>
  );
}
