import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cx } from "./cx";

type Variant = "primary" | "hero" | "secondary" | "ghost" | "danger" | "ink";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] font-semibold transition-[background-color,border-color,transform] duration-100 active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:opacity-45 min-h-11 select-none text-center";
const variants: Record<Variant, string> = {
  // The one primary action per screen (docs/launch-ux/02 C-11.1).
  primary: "bg-accent text-accent-ink hover:bg-accent-strong",
  // Retired gradient "hero": now the same as primary, kept so call sites compile.
  hero: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-accent hover:bg-accent-soft",
  // Destructive/irreversible actions: strong neutral outline. Red is reserved for
  // validation and delivery failures (UX spec §2).
  danger: "bg-surface text-ink border-[1.5px] border-ink hover:bg-sunken",
  // Emergency only.
  ink: "bg-ink text-canvas hover:opacity-90",
};
const sizes: Record<Size, string> = {
  md: "px-5 py-2.5 text-[0.95rem]",
  lg: "min-h-13 px-6 py-3.5 text-base w-full",
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
      data-variant={variant === "hero" ? "primary" : variant}
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
    <Link href={href} className={cx(base, variants[variant], sizes[size], className)} data-variant={variant === "hero" ? "primary" : variant}>
      {children}
    </Link>
  );
}
