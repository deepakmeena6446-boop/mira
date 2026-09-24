"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Compact header navigation for tablet/desktop. */
export function HeaderNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-[0.95rem] font-medium transition-colors",
                  active ? "bg-accent-soft text-accent-strong" : "text-ink-muted hover:bg-sunken hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Persistent bottom navigation on phones (UX spec §1). */
export function BottomNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium",
                  active ? "text-accent" : "text-ink-muted",
                )}
              >
                <Icon name={item.icon} className="size-6" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
