"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api-client";

/** The open journey as the journey bar and Home show it. */
/** `sharedAt`: when her position last reached followers (null: not yet; undefined: not known here). */
export type DockTrip = { state: "active" | "missed"; destination: string | null; etaAt: string; following: string[]; sharedAt?: string | null };
type TripLike = { state: string; destination: { name: string }; etaAt: string; autoArrival: boolean; sharedWith: Array<{ name: string; notified: boolean }>; lastLocation?: { at: string } | null } | null;

/**
 * One client copy of "is a journey open?" (audit P18-001 / P15-001). The server layout renders the bar once and
 * App Router keeps layouts across navigation, so on its own the bar kept saying "On your way… Sis can follow" after
 * I'm here, End or a miss elsewhere. This store refreshes on navigation, when the tab comes back, and every 30 s;
 * the journey screen publishes into it the moment it learns anything. `undefined`: not checked yet (use the server's).
 */
let current: DockTrip | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dockTripFrom(trip: TripLike): DockTrip | null {
  if (!trip || (trip.state !== "active" && trip.state !== "missed")) return null;
  return { state: trip.state, destination: trip.autoArrival ? trip.destination.name : null, etaAt: trip.etaAt, following: trip.sharedWith.filter((c) => c.notified).map((c) => c.name), sharedAt: trip.lastLocation?.at ?? null };
}
export function publishTrip(trip: TripLike) {
  const next = dockTripFrom(trip);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  emit();
}

let inflight: Promise<void> | null = null;
export function refreshCurrentTrip(): Promise<void> {
  inflight ??= api<{ trip: TripLike }>("/api/trips/current")
    .then((r) => { if (r.ok) publishTrip(r.data.trip); else if (r.status === 401) publishTrip(null); })
    .finally(() => { inflight = null; });
  return inflight;
}

/** The open journey, kept current. `initial` is the server's answer, used until the first client check. */
export function useCurrentTrip(initial: DockTrip | null): DockTrip | null {
  const path = usePathname();
  const known = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => undefined);
  useEffect(() => { void refreshCurrentTrip(); }, [path]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void refreshCurrentTrip(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refreshCurrentTrip(); }, 30_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(timer); };
  }, []);
  return known === undefined ? initial : known;
}
