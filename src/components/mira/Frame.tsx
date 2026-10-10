"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { MiraPulse, type PulseState } from "@/components/app/MiraPulse";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { useOverlay, useScrimClose } from "@/lib/use-overlay";

/**
 * Root screen header: a title on the left, the Support pair (I feel unsafe · Emergency) on the right.
 * The Support pair renders exactly once per screen, always in this place (C-10.2).
 */
export function RootHeader({ title, eyebrow, leading, emailAlerts, className }: { title?: React.ReactNode; eyebrow?: React.ReactNode; leading?: React.ReactNode; emailAlerts: boolean; className?: string }) {
  return (
    <header className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          {leading}
          {title ? <h1 className="m-title whitespace-nowrap">{title}</h1> : null}
        </div>
        <SafetyAccess emailAlerts={emailAlerts} compact quiet className="min-w-0" />
      </div>
      {/* Context sits on its own line so a long area name never squeezes the title or the Support pair. */}
      {eyebrow ? <p className="m-meta mt-1 truncate">{eyebrow}</p> : null}
    </header>
  );
}

/** Mira's voice: her presence mark beside one plain sentence (and an optional action). */
export function MiraVoice({ children, state = "observing", action, className, size = "md" }: { children: React.ReactNode; state?: PulseState; action?: React.ReactNode; className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <MiraPulse size={size === "lg" ? 20 : 16} state={state} className={size === "lg" ? "mt-1.5" : "mt-1"} />
      <div className="min-w-0 flex-1">
        <div className={cx("text-mixed", size === "lg" ? "text-[1.0625rem] leading-relaxed" : "text-[0.95rem] leading-relaxed")}>{children}</div>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

/** A situation the person is about to be in. Never a feature name. */
export function IntentTile({ href, onClick, icon, title, hint, tone = "accent" }: { href?: string; onClick?: () => void; icon: string; title: string; hint: string; tone?: "accent" | "dusk" | "people" | "ink" }) {
  const toneClass = { accent: "bg-accent-soft text-accent-strong", dusk: "bg-dusk-soft text-dusk", people: "bg-people-soft text-people", ink: "bg-sunken text-ink" }[tone];
  const body = (
    <>
      <span aria-hidden className={cx("grid size-11 place-items-center rounded-2xl", toneClass)}>
        <Icon name={icon} className="size-[22px]" />
      </span>
      <span className="mt-3 block text-[1.02rem] font-semibold leading-tight">{title}</span>
      <span className="mt-1 block text-[0.8125rem] leading-snug text-ink-muted">{hint}</span>
    </>
  );
  const cls = "m-card m-press block min-h-[8.5rem] p-4 text-left hover:bg-sunken/40";
  return href ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

/** Sticky thumb-zone bar: one primary action, quiet secondaries. */
export function ActionBar({ children, edge = false, className }: { children: React.ReactNode; edge?: boolean; className?: string }) {
  return (
    <div className="m-actionbar" data-edge={edge || undefined}>
      <div className={cx("mx-auto flex max-w-xl items-center gap-2", className)}>{children}</div>
    </div>
  );
}

/** Inline empty / offline / permission / failure note with one next step. */
export function StateNote({ tone = "quiet", title, children, action, className, role = "status" }: { tone?: "quiet" | "attention"; title?: string; children?: React.ReactNode; action?: React.ReactNode; className?: string; role?: "status" | "alert" }) {
  return (
    <div role={role} className={cx("rounded-2xl p-4 text-sm", tone === "attention" ? "bg-warm-soft" : "bg-sunken", className)}>
      {title ? <p className={cx("font-semibold", tone === "attention" ? "text-warm" : "text-ink")}>{title}</p> : null}
      {children ? <div className={cx("text-ink-muted", title && "mt-1")}>{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

const noSubscribe = () => () => {};

/**
 * Modal bottom sheet. Keep it mounted and flip `open` (a sheet mounted already open closes itself
 * under React dev double-effects — see mira-next16-gotchas). Portalled so it rises above the tab bar.
 */
export function Sheet({ open, onClose, title, children, labelledBy = "m-sheet-title", footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; labelledBy?: string; footer?: React.ReactNode }) {
  useOverlay(open, onClose);
  const scrimClose = useScrimClose(open, onClose);
  // The portal needs document.body, which the server doesn't have: render it only after hydration, so a page
  // that opens with its sheet up (/around?check=1) hydrates the same markup the server sent.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!open || !hydrated) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="fixed inset-0 z-[55] flex items-end justify-center bg-scrim animate-fade sm:items-center" onClick={scrimClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[var(--radius-sheet)] bg-surface shadow-[var(--shadow-sheet)] animate-rise sm:rounded-[var(--radius-sheet)]">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id={labelledBy} className="m-title">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken">
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div> : <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}

/** A tappable plan question: label, the answer (or a prompt), and its state. */
export function QuestionRow({ label, value, placeholder, icon, onClick, state = "idle", hint }: { label: string; value?: string | null; placeholder: string; icon: string; onClick: () => void; state?: "idle" | "needs" | "loading" | "next"; hint?: string | null }) {
  // "next": the one question that comes next, marked so the sequence is obvious on a small screen.
  const next = state === "next";
  return (
    <button type="button" onClick={onClick} className={cx("m-press relative flex min-h-[4rem] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken/50", next && "bg-accent-soft/50")}>
      {next ? <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent" /> : null}
      <span aria-hidden className={cx("grid size-9 shrink-0 place-items-center rounded-full", next ? "bg-accent text-accent-ink" : value ? "bg-accent-soft text-accent-strong" : "bg-sunken text-ink-muted")}><Icon name={value && !next ? "check" : icon} className="size-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="m-label block">{label}{next ? <span className="ml-1.5 font-semibold text-accent-strong">· Next</span> : null}</span>
        <span className={cx("block text-[1rem] leading-snug [overflow-wrap:anywhere]", value ? "font-semibold text-ink" : next ? "text-ink-muted" : "text-ink-subtle")}>{value || placeholder}</span>
        {hint ? <span className={cx("block text-xs", state === "needs" ? "text-warm" : "text-ink-muted")}>{hint}</span> : null}
      </span>
      {state === "loading" ? <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-ink-subtle border-t-transparent" /> : <Icon name="chevron" className="size-4 text-ink-subtle" />}
    </button>
  );
}
