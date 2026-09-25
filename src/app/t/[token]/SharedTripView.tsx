"use client";

import { useEffect, useState } from "react";
import { WorldMap } from "@/components/map/WorldMap";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Avatar } from "@/components/app/Avatar";

export interface SharedTrip {
  state: string;
  name: string;
  destination: string;
  dest?: { lat: number; lon: number };
  etaAt?: string;
  location?: { lat: number; lon: number; at: string; ageSeconds: number } | null;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function ago(s: number) {
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** What a trusted contact sees: live dot + ETA while the trip is shared, nothing after. */
export function SharedTripView({ token, initial, tiles }: { token: string; initial: SharedTrip; tiles: { url: string; attribution: string; styleUrl?: string | null } }) {
  const [trip, setTrip] = useState(initial);
  useEffect(() => {
    if (trip.state !== "active" && trip.state !== "missed") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/t/${token}`, { cache: "no-store" });
      if (r.ok) setTrip(await r.json());
    }, 15_000);
    return () => clearInterval(t);
  }, [token, trip.state]);

  const open = trip.state === "active" || trip.state === "missed";
  if (!open) {
    return (
      <main className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <MiraOrb size={72} />
        <h1 className="mt-5 text-2xl font-extrabold">{trip.state === "arrived" ? `${trip.name} arrived 🎉` : `${trip.name}'s trip has ended`}</h1>
        <p className="mt-2 max-w-sm text-ink-muted">Live sharing is off. MIRA doesn&apos;t keep a record of the trip.</p>
      </main>
    );
  }
  const me = trip.location ? { lat: trip.location.lat, lon: trip.location.lon } : null;
  return (
    <main className="fixed inset-0">
      <WorldMap tiles={tiles} me={me} dest={trip.dest ?? null} follow label={`Live location of ${trip.name}`} padding={{ top: 80, bottom: 300, left: 40, right: 40 }} />
      <section className="glass absolute inset-x-0 bottom-0 z-20 mx-auto max-w-xl rounded-t-[2rem] border border-white/70 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-3">
          <Avatar name={trip.name} size={48} />
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold">
              {trip.name} is walking to {trip.destination}
            </h1>
            <p className="text-ink-muted">
              {trip.etaAt ? `Expected by ${time(trip.etaAt)}` : ""}
              {trip.location ? ` · updated ${ago(trip.location.ageSeconds)}` : ""}
            </p>
          </div>
        </div>
        {trip.state === "missed" ? (
          <p className="mt-4 rounded-2xl bg-warm-soft px-4 py-3 font-semibold text-warm">
            {trip.name} hasn&apos;t checked in yet. They may just have forgotten — try calling them. MIRA isn&apos;t an emergency service.
          </p>
        ) : trip.location && trip.location.ageSeconds > 180 ? (
          <p className="mt-4 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink-muted">Showing their last shared spot — their phone may have locked the app.</p>
        ) : null}
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-subtle">
          <MiraOrb size={18} calm /> Shared privately with you on MIRA. This link stops working when the trip ends.
        </p>
      </section>
    </main>
  );
}
