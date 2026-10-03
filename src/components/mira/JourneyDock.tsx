"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { MiraPulse } from "@/components/app/MiraPulse";
import { useClock } from "@/lib/location-store";
import { useLocalJourneyActive } from "@/lib/local-check-in-store";

export type DockTrip = { state: "active" | "missed"; destination: string | null; etaAt: string; following: string[] };

/** Screens that already own the journey (or a sticky action bar) don't get the dock. */
const HIDDEN = ["/trip", "/plan", "/mira"];

/**
 * The open journey, one tap away from every root (docs/phase1-ux/01 §2). It says only what's true:
 * where to, time left, and who can follow — or that nobody can.
 */
export function JourneyDock({ trip }: { trip: DockTrip | null }) {
  const path = usePathname() ?? "/";
  const clock = useClock();
  const manual = useLocalJourneyActive();
  if (HIDDEN.some((h) => path === h || path.startsWith(`${h}/`))) return null;
  if (!trip && !manual) return null;
  const missed = trip?.state === "missed";
  const left = trip && clock ? Math.round((new Date(trip.etaAt).getTime() - clock.getTime()) / 60_000) : null;
  const title = !trip ? "Private check-in running" : missed ? "Check-in due — are you okay?" : trip.destination ? `On your way to ${trip.destination}` : "Sharing where you are";
  const detail = !trip ? "On this device only · no location" : [left === null ? null : left > 0 ? `${left} min left` : "ETA passed", trip.following.length ? `${trip.following.join(", ")} can follow` : "Only people you send your link to can follow"].filter(Boolean).join(" · ");
  return (
    <div className="m-dock">
      <Link href={trip ? "/trip" : "/trip/local"} aria-label={`Open your journey: ${title}`} className={cx("mx-auto flex max-w-xl items-center gap-3 rounded-full py-2 pl-4 pr-2 shadow-[var(--shadow-float)] ring-1", missed ? "bg-warm-soft ring-warm/40" : "bg-surface ring-line")}>
        <MiraPulse size={16} state={missed ? "attention" : "with-you"} ambient />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-ink-muted">{detail}</span>
        </span>
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", missed ? "bg-warm text-white" : "bg-accent text-accent-ink")}>
          <Icon name="chevron" className="size-4" />
        </span>
      </Link>
    </div>
  );
}
