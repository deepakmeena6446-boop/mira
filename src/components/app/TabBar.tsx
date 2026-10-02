"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * V1 stable roots: Go · Journeys · You. Map, Ask and contribution are contextual.
 * Trip and emergency controls remain available in context, without turning them into tabs.
 */
const TABS = [
  { href: "/", label: "Go", icon: "home", match: ["/", "/today", "/plan", "/around", "/mira", "/contribute", "/report"] },
  { href: "/trips", label: "Journeys", icon: "route", match: ["/trips", "/trip"] },
  { href: "/me", label: "You", icon: "user", match: ["/me", "/circle", "/inbox", "/privacy"] },
] as const;
const LEGACY_TABS = [
  { href: "/", label: "Today", icon: "home", match: ["/", "/today", "/trips", "/trip"] },
  { href: "/around", label: "Around", icon: "pin", match: ["/around"] },
  { href: "/mira", label: "Mira", icon: "sparkle", match: ["/mira"] },
  { href: "/contribute", label: "Contribute", icon: "contribute", match: ["/contribute", "/report"] },
  { href: "/me", label: "You", icon: "user", match: ["/me", "/circle", "/inbox", "/privacy"] },
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
  const tabs = process.env.NEXT_PUBLIC_MIRA_GO_ENTRY === "legacy" ? LEGACY_TABS : TABS;
  return (
    <nav aria-label="Main" className="mira-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className={cx("mx-auto grid h-[var(--tabbar-h)] max-w-xl", tabs.length === 3 ? "grid-cols-3" : "grid-cols-5")}>
        {tabs.map((t) => {
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
