import { cx } from "@/components/ui/cx";

export function Chip({
  children,
  onClick,
  active,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[0.95rem] font-semibold transition-all active:scale-[0.97]",
        active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink shadow-[var(--shadow-card)] hover:border-accent/40",
        className,
      )}
    >
      {children}
    </button>
  );
}
