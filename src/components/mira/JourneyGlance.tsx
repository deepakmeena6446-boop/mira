"use client";

import { cx } from "@/components/ui/cx";
import { SkyCard, skyAt } from "@/components/mira/LiveNow";
import { journeyNoun, modeWords } from "@/domain/travel-prefs";
import type { TripView } from "@/server/trips";

export type GlanceTrip = Pick<TripView, "state" | "destination" | "etaAt" | "mode" | "autoArrival"> & { sharing: boolean };

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * The journey at a glance: the same sky card on the live journey screen and in Journeys, so the
 * journey looks like one thing wherever it appears. Time left leads; where to and how follow.
 */
export function JourneyGlance({ trip, clock, at, attention = false, distance = null, headingAs = "h2", footer }: {
  trip: GlanceTrip;
  clock: Date | null;
  /** Where the sky is read: her position when known, else the destination. */
  at?: { lat: number; lon: number } | null;
  attention?: boolean;
  distance?: number | null;
  headingAs?: "h1" | "h2";
  footer?: { label: string; href?: string; onClick?: () => void } | null;
}) {
  const now = clock?.getTime() ?? new Date(trip.etaAt).getTime();
  const left = new Date(trip.etaAt).getTime() - now;
  const mins = Math.round(Math.abs(left) / 60_000);
  const span = mins >= 90 ? `${Math.round(mins / 60)} h` : `${mins} min`;
  const missed = trip.state === "missed";
  const noun = journeyNoun(trip.autoArrival ? trip.mode : "other");
  const modeLine = trip.mode === "other" ? "" : modeWords(trip.mode).short;
  const Heading = headingAs;
  return (
    <SkyCard
      state={skyAt(clock, at ?? trip.destination)}
      label="Journey status"
      pulse={missed || attention ? "attention" : "with-you"}
      eyebrow={missed ? "Check-in due" : trip.sharing ? "Sharing enabled" : `${noun[0].toUpperCase()}${noun.slice(1)} in progress`}
      aside={trip.autoArrival ? (clock ? `ETA ${time(trip.etaAt)}` : "ETA") : clock ? `Until ${time(trip.etaAt)}` : null}
      title={<span className="flex items-baseline justify-between gap-3"><span className="min-w-0"><span className="block text-[0.72rem] font-medium tracking-normal text-[color:var(--sky-muted)]">{trip.autoArrival ? (left > 0 ? "Expected in" : "Expected") : "Sharing for"}</span><span className={cx("block tabular-nums", left > 0 ? "text-[2.75rem] leading-none" : "text-[1.75rem]")}>{!clock ? "…" : left > 0 ? span : mins < 1 ? "now" : `${span} ago`}</span></span></span>}
      line={<><Heading className="truncate font-semibold text-[color:var(--sky-ink)]">{trip.autoArrival ? `To ${trip.destination.name}${modeLine ? ` · ${modeLine}` : ""}` : "Sharing where you are"}</Heading>{distance !== null && trip.autoArrival ? <span>{distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1)} km`} to go · ETA with time to spare</span> : null}</>}
      footer={footer}
    />
  );
}
