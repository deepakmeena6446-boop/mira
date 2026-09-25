"use client";

import { useEffect, useState } from "react";
import { WorldMap } from "@/components/map/WorldMap";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Avatar } from "@/components/app/Avatar";
import { useClock } from "@/lib/location-store";

export interface SharedTrip {
  state: string;
  name: string;
  destination?: string;
  dest?: { lat: number; lon: number };
  etaAt?: string;
  /** True for trusted contacts (they get the missed-arrival email); false for a link shared directly. */
  alertsViewer?: boolean;
  location?: { lat: number; lon: number; at: string; ageSeconds: number } | null;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function ago(s: number) {
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

const POLL_MS = 15_000;

/** What someone holding the live link sees: live dot + ETA while the trip is open, then only "arrived/ended". */
export function SharedTripView({ token, initial, tiles }: { token: string; initial: SharedTrip; tiles: { url: string; attribution: string; styleUrl?: string | null; nightStyleUrl?: string | null; nightUrl?: string | null } }) {
  const [trip, setTrip] = useState(initial);
  const [pollFailedAt, setPollFailedAt] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const now = useClock(); // ticks on the device, so "updated X ago" keeps moving even when polls fail
  const open = !gone && (trip.state === "active" || trip.state === "missed");

  useEffect(() => {
    if (!open) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/t/${token}`, { cache: "no-store" });
        if (r.ok) {
          setTrip(await r.json());
          setPollFailedAt(null);
        } else if (r.status === 404) {
          setGone(true); // trip closed long ago, link revoked, or account deleted
        } else {
          setPollFailedAt((v) => v ?? Date.now());
        }
      } catch {
        setPollFailedAt((v) => v ?? Date.now());
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [token, open]);

  if (!open) {
    return (
      <main className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <MiraOrb size={72} />
        <h1 className="mt-5 text-2xl font-extrabold">{gone ? "This trip link has ended" : trip.state === "arrived" ? `${trip.name} arrived 🎉` : `${trip.name}'s trip has ended`}</h1>
        <p className="mt-2 max-w-sm text-ink-muted">Live sharing is off. MIRA doesn&apos;t keep a record of the trip.</p>
      </main>
    );
  }

  const me = trip.location ? { lat: trip.location.lat, lon: trip.location.lon } : null;
  const age = trip.location ? (now ? Math.max(0, Math.round((now.getTime() - new Date(trip.location.at).getTime()) / 1000)) : trip.location.ageSeconds) : null;
  const polledFailed = pollFailedAt !== null;
  return (
    <main className="fixed inset-0">
      <WorldMap tiles={tiles} me={me} dest={trip.dest ?? null} follow label={`Live location of ${trip.name}`} padding={{ top: 80, bottom: 300, left: 40, right: 40 }} />
      <section className="glass absolute inset-x-0 bottom-0 z-20 mx-auto max-w-xl rounded-t-[2rem] border border-glass-edge p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-3">
          <Avatar name={trip.name} size={48} />
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold">
              {trip.name} is walking to {trip.destination}
            </h1>
            {/* Times render after mount: the server doesn't know the viewer's time zone. */}
            <p className="text-ink-muted">
              {now && trip.etaAt ? `Expected by ${time(trip.etaAt)}` : ""}
              {age !== null ? ` · updated ${ago(age)}` : ""}
            </p>
          </div>
        </div>
        {polledFailed ? (
          <p role="status" className="mt-4 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink-muted">
            <span className="font-bold text-ink">Can&apos;t refresh right now.</span> Check your connection — this shows the last update I received.
          </p>
        ) : null}
        {trip.state === "missed" ? (
          <p role="alert" className="mt-4 rounded-2xl bg-warm-soft px-4 py-3 font-semibold text-warm">
            {trip.name} hasn&apos;t checked in yet. They may just have forgotten — try calling them. MIRA isn&apos;t an emergency service; if you think they&apos;re in danger, call your local emergency number.
          </p>
        ) : age !== null && age > 180 ? (
          <p className="mt-4 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink-muted">
            <span className="font-bold text-ink">Location paused.</span> This is their last shared spot, from {ago(age)} — often it just means the phone screen is off.
            {trip.alertsViewer ? ` MIRA will still email you if ${trip.name} doesn't check in.` : ""}
          </p>
        ) : null}
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-subtle">
          <MiraOrb size={18} calm /> Shared privately with you on MIRA. This link stops working shortly after the trip ends.
        </p>
      </section>
    </main>
  );
}
