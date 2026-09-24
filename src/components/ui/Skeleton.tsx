import { cx } from "./cx";

/** Shape-only loading placeholder. Never filled with fake content. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton h-4", className)} />;
}

export function CardSkeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-5 w-2/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx("mt-3", i % 2 ? "w-5/6" : "w-full")} />
      ))}
    </div>
  );
}
