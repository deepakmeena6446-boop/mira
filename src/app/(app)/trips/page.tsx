import type { Metadata } from "next";
import Link from "next/link";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { tripsOverview, type TripSummary, type TripView } from "@/server/trips";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Section } from "@/components/app/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { formatPlaceTime } from "@/lib/time";
import { modeWords } from "@/domain/travel-prefs";
import { TripsSignedOut } from "./TripsSignedOut";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trips" };

const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

const CLOSED: Record<string, string> = { arrived: "Arrived", ended: "Ended", expired: "Closed" };

/**
 * TRIPS tab: the journey she's on first, then journeys that finished in the last day (they are
 * deleted after that). No travel diary, no map history, no coordinates — times in the zone her
 * phone had when she started, labelled.
 */
export default async function TripsPage() {
  const sql = getSql();
  const user = await getUser(sql);
  const now = systemClock.now();
  const data = user ? await tripsOverview(sql, user.id, now) : null;

  return (
    <div className="bg-companion min-h-dvh px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex items-center gap-3 pt-2">
          <MiraOrb size={40} calm />
          <h1 className="text-2xl font-extrabold">Trips</h1>
        </header>

        {!data ? (
          <TripsSignedOut />
        ) : (
          <>
            {data.active ? <ActiveCard trip={data.active} now={now} /> : <NoActive />}
            <Section id="recent" title="Earlier today">
              {data.recent.length ? (
                <ul className="divide-y divide-line">
                  {data.recent.map((t) => (
                    <RecentRow key={t.id} trip={t} />
                  ))}
                </ul>
              ) : (
                <p className="p-5 text-ink-muted">No finished journeys right now.</p>
              )}
            </Section>
            <p className="px-1 text-sm text-ink-subtle">MIRA keeps finished journeys for a day at most, then deletes them. There&apos;s no travel diary and no map of where you&apos;ve been.</p>
          </>
        )}
      </div>
    </div>
  );
}

function ActiveCard({ trip, now }: { trip: TripView; now: Date }) {
  const shared = trip.sharedWith.filter((c) => c.notified).map((c) => c.name);
  const left = Math.round((new Date(trip.etaAt).getTime() - now.getTime()) / 60_000);
  const mode = trip.autoArrival && trip.mode !== "other" ? ` · ${modeWords(trip.mode).short}` : "";
  return (
    <Link href="/trip" className="block rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)] hover:bg-sunken" aria-label={`Open your journey${trip.autoArrival ? ` to ${trip.destination.name}` : ""}`}>
      <p className="flex items-center gap-2 text-sm font-bold text-accent">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
        </span>
        {trip.state === "missed" ? "Waiting for you to check in" : "On the way now"}
      </p>
      <p className="mt-1 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xl font-extrabold">{trip.autoArrival ? `To ${trip.destination.name}${mode}` : "Sharing where you are"}</span>
        <Icon name="chevron" className="size-5 shrink-0 text-ink-subtle" />
      </p>
      <p className="mt-1 text-ink-muted">
        {trip.autoArrival ? "ETA" : "Until"} {formatPlaceTime(trip.etaAt, trip.tz)}
        {left > 0 ? ` · in about ${left} min` : ""}
      </p>
      <p className="mt-2 text-sm text-ink-muted">{shared.length ? `${names(shared)} can follow along.` : "Only people you send your live link to can follow."}</p>
    </Link>
  );
}

function NoActive() {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
      <p className="font-bold">No journey right now</p>
      <p className="mt-1 text-sm text-ink-muted">Start one from Home: MIRA stays with you until you arrive, and ends by itself when you get there.</p>
      <ButtonLink href="/" variant="primary" className="mt-4">
        Where are you going?
      </ButtonLink>
    </div>
  );
}

function RecentRow({ trip }: { trip: TripSummary }) {
  const title = trip.autoArrival ? trip.destination : "Shared where you were";
  const mode = trip.autoArrival && trip.mode !== "other" ? ` · ${modeWords(trip.mode).short}` : "";
  return (
    <li className="px-5 py-3">
      <p className="font-bold">
        {title}
        <span className="font-normal text-ink-muted">{mode}</span>
      </p>
      <p className="text-sm text-ink-muted">
        {CLOSED[trip.state] ?? "Finished"} {formatPlaceTime(trip.closedAt, trip.tz)}
        {trip.sharedWith.length ? ` · shared with ${names(trip.sharedWith)}` : ""}
      </p>
    </li>
  );
}
