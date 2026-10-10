"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * The ways to start, in one list, so Home and Journeys offer exactly the same starts. The first two are
 * the companion's two equal paths (an outing, or context around a place); the presets follow. All four
 * are structured routes that work without Mira's model or the person's location.
 */
export const SITUATIONS = [
  { href: "/plan?for=go", icon: "route", label: "Plan an outing", hint: "Choose where and when. Get a short brief before you go." },
  { href: "/around?check=1", icon: "pin", label: "Around a place", hint: "See what’s known near a place — no route or location needed." },
  { href: "/plan?for=run", icon: "walk", label: "Run or walk", hint: "A loop from your start, with daylight for the time you choose." },
  { href: "/plan?for=travel", icon: "airport", label: "Travelling", hint: "Arriving somewhere new: the way to where you’re staying." },
] as const;

/**
 * The start list (design/mira-companion-ux): the two main paths as explained rows — what each gives — and
 * the presets as quiet links. Rows, not a grid of equal tiles, so the choice reads in one pass.
 */
export function StartChoices({ className, headingId = "start-h", heading = "Or start with" }: { className?: string; headingId?: string; heading?: string }) {
  const [plan, around, ...more] = SITUATIONS;
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="m-label">{heading}</h2>
      <ul className="m-card mt-2 divide-y divide-line overflow-hidden">
        {[plan, around].map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="m-press flex min-h-16 items-center gap-3.5 px-4 py-3 hover:bg-sunken/60">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong"><Icon name={s.icon} className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug">{s.label}</span>
                <span className="block text-[0.8125rem] leading-snug text-ink-muted">{s.hint}</span>
              </span>
              <Icon name="chevron" className="size-4 shrink-0 text-ink-subtle" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap gap-x-5 px-1">
        {more.map((s) => (
          <Link key={s.href} href={s.href} className="m-link text-ink-muted">
            <Icon name={s.icon} className="size-4" />{s.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
