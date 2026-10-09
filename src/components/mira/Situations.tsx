"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * The ways to start, in one list, so Home and Journeys offer exactly the same starts. The first two are
 * the companion's two equal paths (an outing, or context around a place); the presets follow. All four
 * are structured routes that work without Mira's model or the person's location.
 */
export const SITUATIONS = [
  { href: "/plan?for=go", icon: "route", label: "Plan an outing" },
  { href: "/around?check=1", icon: "search", label: "Around a place" },
  { href: "/plan?for=run", icon: "walk", label: "Run or walk" },
  { href: "/plan?for=travel", icon: "airport", label: "Travelling" },
] as const;

export function SituationChips({ className }: { className?: string }) {
  return (
    <div className={className ? `grid grid-cols-2 gap-2 ${className}` : "grid grid-cols-2 gap-2"}>
      {SITUATIONS.map((s) => (
        <Link key={s.href} href={s.href} className="m-card m-press flex min-h-12 items-center gap-2.5 px-3.5 text-[0.875rem] font-semibold">
          <Icon name={s.icon} className="size-[18px] shrink-0 text-accent" />{s.label}
        </Link>
      ))}
    </div>
  );
}
