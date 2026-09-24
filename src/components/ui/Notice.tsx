import { cx } from "./cx";

type Tone = "info" | "attention" | "error" | "neutral";

const tones: Record<Tone, string> = {
  info: "bg-accent-soft border-accent/30 text-ink",
  attention: "bg-warm-soft border-warm/30 text-ink",
  error: "bg-error-soft border-error/40 text-ink",
  neutral: "bg-sunken border-line text-ink",
};

/**
 * Inline status message. `error` is reserved for validation and delivery failures
 * (UX spec §2); unavailable services use `attention` or `neutral`.
 */
export function Notice({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className={cx("rounded-[var(--radius-control)] border px-4 py-3 text-[0.95rem]", tones[tone], className)}>
      {title ? <p className={cx("font-semibold", tone === "error" && "text-error")}>{title}</p> : null}
      {children ? <div className={cx(title && "mt-1", "text-ink-muted [&_a]:text-accent [&_a]:underline")}>{children}</div> : null}
    </div>
  );
}
