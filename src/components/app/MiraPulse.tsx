import { cx } from "@/components/ui/cx";

export type PulseState = "observing" | "thinking" | "noticed" | "attention" | "with-you";

/**
 * Mira's presence mark (docs/launch-ux/04 §12): a dot and a ring. It carries state, never decoration —
 * observing (static), thinking (a rotating arc while real work is pending), noticed (one ripple when a
 * new fact appears), attention (warm, static), with-you (slow breath on an active journey).
 * `scout` adds the outer ring of the Mira Scout mark. Always aria-hidden: state is also said in text.
 */
export function MiraPulse({ size = 16, state = "observing", scout = false, className }: { size?: number; state?: PulseState; scout?: boolean; className?: string }) {
  const outer = scout ? size + 8 : size;
  return (
    <span aria-hidden data-pulse={state} className={cx("mira-pulse relative inline-grid shrink-0 place-items-center", state === "attention" ? "text-warm" : "text-accent", className)} style={{ width: outer, height: outer }}>
      {scout ? <span className="mira-pulse-scout absolute inset-0 rounded-full border border-current opacity-50" /> : null}
      <span className="mira-pulse-ring absolute rounded-full border-[1.5px] border-current" style={{ width: size, height: size }} />
      <span className="rounded-full bg-current" style={{ width: Math.max(4, Math.round(size * 0.38)), height: Math.max(4, Math.round(size * 0.38)) }} />
    </span>
  );
}
