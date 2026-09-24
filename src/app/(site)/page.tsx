import Link from "next/link";
import { getCapabilities } from "@/server/capabilities";
import { ServiceBanner } from "@/components/layout/ServiceBanner";
import { HomePlacePicker } from "@/components/places/HomePlacePicker";
import { Icon } from "@/components/ui/Icon";
import { ActiveJourneyCard } from "@/components/layout/ActiveJourney";

export const dynamic = "force-dynamic";

const ACTIONS = [
  {
    href: "/know",
    icon: "know",
    eyebrow: "Know",
    title: "Know the area",
    body: "Mapped places and walking routes, with sources, freshness and what we don't know.",
  },
  {
    href: "/accompany",
    icon: "accompany",
    eyebrow: "Accompany",
    title: "Make sure I reach",
    body: "Set a private check-in for your ETA. No location tracking.",
  },
  {
    href: "/report",
    icon: "report",
    eyebrow: "Report",
    title: "Share an observation",
    body: "Describe what you experienced or noticed. It stays private while it's reviewed.",
  },
] as const;

export default async function Home() {
  const caps = await getCapabilities();
  return (
    <div className="flex flex-col gap-6 pb-4">
      <ServiceBanner caps={caps} />

      <section aria-labelledby="home-title" className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Know more. Move freely.</p>
        <h1 id="home-title" className="sr-only">
          MIRA home
        </h1>
        <div className="mt-3">
          <HomePlacePicker mapAvailable={caps.map.available} journeysAvailable={caps.journeys} />
        </div>
        <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <span>
            MIRA shares observed conditions, not safety guarantees. It currently covers Delhi University North Campus around Vishwavidyalaya Metro.
          </span>
        </p>
      </section>

      <ActiveJourneyCard />

      <section aria-label="What would you like to do?">
        <ul className="grid gap-3 md:grid-cols-3">
          {ACTIONS.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="group flex h-full min-h-32 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-colors hover:border-accent"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-accent">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent-soft">
                    <Icon name={a.icon} className="size-5" />
                  </span>
                  {a.eyebrow}
                </span>
                <span className="mt-3 text-xl font-bold">{a.title}</span>
                <span className="mt-1 text-ink-muted">{a.body}</span>
                <span className="mt-auto flex items-center gap-1 pt-3 text-sm font-semibold text-accent">
                  Open <Icon name="arrow" className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
