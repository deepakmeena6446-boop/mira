"use client";

import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useLocale } from "@/lib/locale-store";

/**
 * Always-visible emergency control: opens the phone's own dialler with the emergency number
 * for where she is (Location Context; 112 until known). No AI, no network, no confirmation —
 * one tap. Calm on purpose: neutral colours, no siren, but high contrast and a 44 px target.
 */
export function EmergencyPill({ className }: { className?: string }) {
  const { emergency } = useLocale();
  return (
    <a
      href={`tel:${emergency.number}`}
      aria-label={`Emergency call, ${emergency.number}`}
      className={cx("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-extrabold text-ink shadow-[var(--shadow-card)]", className)}
    >
      <Icon name="phone" className="size-4" />
      <span>Emergency {emergency.number}</span>
    </a>
  );
}
