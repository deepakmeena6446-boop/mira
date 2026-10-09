"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WorldMap } from "@/components/map/WorldMap";
import { MiraPulse } from "@/components/app/MiraPulse";
import { Icon } from "@/components/ui/Icon";
import { SkyCard, skyAt } from "@/components/mira/LiveNow";
import { useClock } from "@/lib/location-store";
import { formatPlaceTime } from "@/lib/time";
import { modeWords } from "@/domain/travel-prefs";

export interface SharedTrip {
  state: string;
  name: string;
  destination?: string;
  dest?: { lat: number; lon: number };
  etaAt?: string;
  /** The traveller's IANA time zone (null: unknown, times shown in UTC). */
  tz?: string | null;
  /** True for trusted contacts (they get the missed-arrival email); false for a link shared directly. */
  alertsViewer?: boolean;
  location?: { lat: number; lon: number; at: string; ageSeconds: number } | null;
  /** walk / ride / transit / other, or "here" when they're sharing where they are. */
  mode?: string;
  /** They tapped "Tell my people now" in the last 30 minutes. */
  checkRequested?: boolean;
}

/** "is walking to", "is on the way by public transport to" — never assumes walking. */
function verb(mode: string | undefined): string {
  if (mode === "walk") return "is walking to";
  const phrase = modeWords(mode).phrase;
  return phrase ? `is on the way ${phrase} to` : "is on the way to";
}

function ago(s: number) {
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

const POLL_MS = 15_000;

/**
 * What someone holding the live link sees — no account, ever. While the trip is open: first
 * name, how they're travelling, ETA in the TRAVELLER's local time (with its zone label), their
 * latest point only and how fresh it is. After it closes: only "arrived/ended", then nothing.
 */
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

  // "expired" is only ever reached from "missed": she never checked in. Never present that as an ordinary end.
  if (!open && !gone && trip.state === "expired") {
    return (
      <main className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-warm-soft text-warm"><Icon name="info" className="size-7" /></span>
        <h1 className="mt-5 text-2xl font-semibold">{trip.name} didn&apos;t check in</h1>
        <p className="mt-2 max-w-sm text-ink-muted">
          {trip.name} missed their check-in and hasn&apos;t tapped &ldquo;I&apos;m here&rdquo; since. Live sharing has now stopped, so this page can&apos;t show where they are.
        </p>
        <p className="mt-3 max-w-sm font-semibold">Call or message {trip.name} directly. If you think they&apos;re in danger, call your local emergency number.</p>
        <p className="mt-3 max-w-sm text-sm text-ink-muted">Mira isn&apos;t an emergency service and can&apos;t contact anyone for you.</p>
      </main>
    );
  }

  if (!open) {
    return (
      <main className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span aria-hidden className={`grid size-14 place-items-center rounded-full ${trip.state === "arrived" ? "bg-accent-soft text-accent" : "bg-sunken text-ink-muted"}`}><Icon name={trip.state === "arrived" ? "check" : "route"} className="size-7" /></span>
        <h1 className="mt-5 text-2xl font-semibold">{gone ? "This trip link has ended" : trip.state === "arrived" ? `${trip.name} arrived.` : `${trip.name}'s trip has ended`}</h1>
        <p className="mt-2 max-w-sm text-ink-muted">
Live sharing is off. Mira doesn&apos;t keep a record of the trip.
        </p>
        {/* The viewer → user loop: one quiet card, no referral ids, no tracking parameters. */}
        <div className="mt-8 w-full max-w-sm m-card p-5 text-left">
          <p className="font-semibold">Want Mira for your own journeys?</p>
          <p className="mt-1 text-sm text-ink-muted">See what&apos;s known about the way before you go, share your journey in one tap, and it ends by itself when you arrive. No account needed to follow someone.</p>
          <Link href="/" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent-soft px-4 text-sm font-semibold text-accent-strong">
            Try Mira <Icon name="arrow" className="size-4" />
          </Link>
        </div>
      </main>
    );
  }

  const me = trip.location ? { lat: trip.location.lat, lon: trip.location.lon } : null;
  const age = trip.location ? (now ? Math.max(0, Math.round((now.getTime() - new Date(trip.location.at).getTime()) / 1000)) : trip.location.ageSeconds) : null;
  const polledFailed = pollFailedAt !== null;
  const checkOn = trip.state === "missed" || Boolean(trip.checkRequested);
  const here = trip.mode === "here";
  return (
    <main className="fixed inset-0">
      <WorldMap tiles={tiles} me={me} dest={trip.dest ?? null} follow label={`Live location of ${trip.name}`} padding={{ top: 80, bottom: 320, left: 40, right: 40 }} />
      <section className="absolute inset-x-0 bottom-0 z-20 mx-auto max-w-xl rounded-t-[var(--radius-sheet)] bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[var(--shadow-sheet)]">
        {/* The same sky card the traveller sees on their own journey: the sky where they are, who and where to. */}
        <SkyCard
          state={skyAt(now, me ?? trip.dest ?? null)}
          label="Their journey"
          pulse={checkOn ? "attention" : "with-you"}
          eyebrow={checkOn ? "Check on them" : here ? "Sharing where they are" : "On the way"}
          aside={age !== null ? `updated ${ago(age)}` : null}
          titleAs="h1"
          title={here ? `${trip.name} is sharing where they are` : `${trip.name} ${verb(trip.mode)} ${trip.destination}`}
          /* The ETA is in the traveller's own time zone, labelled, so it reads the same for every viewer. */
          line={trip.etaAt ? `${here ? "Sharing until" : "Expected by"} ${formatPlaceTime(trip.etaAt, trip.tz ?? null)}` : null}
        />
        {polledFailed ? (
          <p role="status" className="mt-4 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink-muted">
            <span className="font-semibold text-ink">Can&apos;t refresh right now.</span> Check your connection — this shows the last update I received.
          </p>
        ) : null}
        {trip.checkRequested ? (
          <p role="alert" className="mt-4 rounded-2xl bg-warm-soft px-4 py-3 font-semibold text-warm">
            {trip.name} asked you to check on them. The best next step is usually to call or message them. Mira isn&apos;t an emergency service; if you think they&apos;re in danger, call your local emergency number.
          </p>
        ) : null}
        {trip.state === "missed" ? (
          <p role="alert" className="mt-4 rounded-2xl bg-warm-soft px-4 py-3 font-semibold text-warm">
            {trip.name} hasn&apos;t checked in yet. They may just have forgotten — try calling them. Mira isn&apos;t an emergency service; if you think they&apos;re in danger, call your local emergency number.
          </p>
        ) : age !== null && age > 180 ? (
          <p className="mt-4 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink-muted">
            <span className="font-semibold text-ink">Location paused.</span> This is their last shared spot, from {ago(age)} — often it just means the phone screen is off.
            {trip.alertsViewer ? ` Mira may attempt an email if ${trip.name} misses check-in; sending can fail.` : ""}
          </p>
        ) : null}
        {checkOn ? null : (
          <p className="mt-4 text-sm text-ink-muted">If you&apos;re worried, call {trip.name} first. In an emergency, call your local emergency number.</p>
        )}
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-subtle">
          <MiraPulse size={12} /> Shared privately with you on Mira. You see their latest spot and where they&rsquo;re heading (a saved place only roughly), and this link stops working shortly after the trip ends.
        </p>
      </section>
    </main>
  );
}
