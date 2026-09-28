import { cx } from "@/components/ui/cx";

export function Chip({
  children,
  onClick,
  active,
  className,
  ariaLabel,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[0.95rem] font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-45",
        active ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-surface text-ink hover:border-line-strong",
        className,
      )}
    >
      {children}
    </button>
  );
}
