import Link from "next/link";
import { getSql } from "@/server/db/client";
import { getActor } from "@/server/session/actor";
import { currentJourney, type JourneyView } from "@/server/journey/service";
import { systemClock } from "@/server/clock";
import { formatIstTime } from "@/lib/time";
import { Icon } from "@/components/ui/Icon";

export async function loadOpenJourney(): Promise<JourneyView | null> {
  try {
    const actor = await getActor();
    if (!actor) return null;
    const j = await currentJourney(getSql(), actor.actorHash, systemClock.now());
    return j && (j.state === "active" || j.state === "missed") ? j : null;
  } catch {
    return null;
  }
}

/** Calm persistent chip linking to the open journey (UX spec §1). */
export async function ActiveJourneyChip() {
  const j = await loadOpenJourney();
  if (!j) return null;
  return (
    <div className="border-b border-line bg-accent-soft">
      <div className="mx-auto max-w-5xl px-4 py-1.5">
        <Link href="/accompany" className="inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm font-semibold text-accent-strong hover:underline">
          <Icon name="accompany" className="size-4" />
          {j.state === "missed" ? "Check-in missed — open journey" : `Journey active · check in by ${formatIstTime(j.etaAt)}`}
        </Link>
      </div>
    </div>
  );
}

export async function ActiveJourneyCard() {
  const j = await loadOpenJourney();
  if (!j) return null;
  return (
    <section aria-labelledby="home-journey-h" className="rounded-[var(--radius-card)] border border-accent bg-surface p-5 shadow-[var(--shadow-card)]">
      <p className="text-sm font-semibold text-accent">{j.state === "missed" ? "Check-in missed" : "Journey active"}</p>
      <h2 id="home-journey-h" className="mt-1 text-xl font-bold text-mixed">
        {j.destination.name}
      </h2>
      <p className="mt-1 text-ink-muted">Check in by {formatIstTime(j.etaAt)}</p>
      <Link href="/accompany" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 font-semibold text-accent-ink">
        Open journey <Icon name="arrow" className="size-4" />
      </Link>
    </section>
  );
}
