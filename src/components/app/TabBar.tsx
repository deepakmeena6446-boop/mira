"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * HOME · Mira · TRIPS · CONTRIBUTE · ME — the locked Day-0 navigation (a stable anchor: never adaptive).
 * Emergency is never a tab: it sits on Home, on the journey screen and in "I feel unsafe". Circle lives in Me.
 */
const TABS = [
  { href: "/", label: "Home", icon: "home", match: ["/"] },
  { href: "/mira", label: "Mira", icon: "sparkle", match: ["/mira"] },
  { href: "/trips", label: "Trips", icon: "route", match: ["/trips", "/trip"] },
  { href: "/contribute", label: "Contribute", icon: "contribute", match: ["/contribute", "/report"] },
  { href: "/me", label: "Me", icon: "user", match: ["/me", "/circle", "/inbox", "/privacy"] },
] as const;

function active(path: string, match: readonly string[]) {
  return match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));
}

/**
 * Docked tab bar — the app's single navigation. Hidden while a journey is open on /trip
 * (immersive journey mode: `html[data-journey="open"]`, set by TripScreen; see globals.css).
 */
export function TabBar() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="mira-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const on = active(path, t.match);
          return (
            <li key={t.href} className="relative">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cx("flex h-full flex-col items-center justify-center gap-0.5 text-[0.72rem] font-medium transition-colors duration-150", on ? "text-accent" : "text-ink-muted hover:text-ink")}
              >
                {on ? <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-accent" /> : null}
                <Icon name={t.icon} className="size-[22px]" />
                <span className="max-w-full truncate px-0.5">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
