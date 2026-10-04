"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/** The four situations a plan starts from. One list, so Home and Journeys offer exactly the same starts. */
export const SITUATIONS = [
  { href: "/plan?for=go", icon: "route", label: "Going somewhere" },
  { href: "/plan?for=run", icon: "walk", label: "Run or walk" },
  { href: "/plan?for=travel", icon: "airport", label: "Travelling" },
  { href: "/around?check=1", icon: "search", label: "Check a place" },
] as const;

export function SituationChips({ className }: { className?: string }) {
  return (
    <div className={className ? `grid grid-cols-2 gap-2 ${className}` : "grid grid-cols-2 gap-2"}>
      {SITUATIONS.map((s) => (
        <Link key={s.href} href={s.href} className="m-card m-press flex min-h-12 items-center gap-2.5 whitespace-nowrap px-3.5 text-[0.875rem] font-semibold">
          <Icon name={s.icon} className="size-[18px] text-accent" />{s.label}
        </Link>
      ))}
    </div>
  );
}
