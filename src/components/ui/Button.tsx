import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cx } from "./cx";

type Variant = "primary" | "hero" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:opacity-60 min-h-12 select-none text-center";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_8px_20px_-8px_rgb(106_68_245/0.6)]",
  hero: "bg-mira text-white shadow-[0_12px_28px_-10px_rgb(106_68_245/0.75)] hover:brightness-105",
  secondary: "bg-surface text-ink border border-line hover:border-accent/40 shadow-[var(--shadow-card)]",
  ghost: "text-accent hover:bg-accent-soft",
  // Destructive/irreversible actions: strong neutral outline. Red is reserved for
  // validation and delivery failures (UX spec §2).
  danger: "bg-surface text-ink border-2 border-ink hover:bg-sunken",
};
const sizes: Record<Size, string> = {
  md: "px-5 py-2.5 text-[0.95rem]",
  lg: "px-6 py-4 text-[1.05rem] w-full",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  busyLabel?: string;
}

/** Button with a built-in busy state that blocks double submission. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", busy = false, busyLabel, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(base, variants[variant], sizes[size], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? (
        <>
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{busyLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cx(base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}
