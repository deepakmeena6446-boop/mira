import { EMERGENCY_NUMBER, emergencyHref } from "@/domain/emergency";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * Always-visible emergency control: opens the phone's own dialler with the emergency number.
 * No AI, no network, no confirmation screen — one tap. Calm on purpose: neutral colours, no
 * siren, but high contrast and a full 44 px target.
 */
export function EmergencyPill({ className }: { className?: string }) {
  return (
    <a
      href={emergencyHref()}
      aria-label={`Emergency call, ${EMERGENCY_NUMBER}`}
      className={cx("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-extrabold text-ink shadow-[var(--shadow-card)]", className)}
    >
      <Icon name="phone" className="size-4" />
      <span>Emergency {EMERGENCY_NUMBER}</span>
    </a>
  );
}
