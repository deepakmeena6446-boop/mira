"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/mira", label: "Mira", icon: "sparkle" },
  { href: "/report", label: "Report", icon: "flag" },
  { href: "/me", label: "Me", icon: "user" },
] as const;

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

/** Floating pill tab bar — the app's single navigation. */
export function TabBar() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ul className="glass pointer-events-auto grid w-full max-w-sm grid-cols-4 rounded-full border border-glass-edge p-1.5 shadow-[var(--shadow-float)]">
        {TABS.map((t) => {
          const on = active(path, t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[0.7rem] font-semibold transition-colors",
                  on ? "bg-accent text-accent-ink shadow-[0_6px_16px_-6px_rgb(106_68_245/0.7)]" : "text-ink-muted hover:text-ink",
                )}
              >
                <Icon name={t.icon} className="size-5" />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
