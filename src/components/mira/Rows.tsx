"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { EvidenceGlyph, type EvidenceKind } from "@/components/mira/Evidence";

export type RowTone = "accent" | "dusk" | "people" | "ink" | "warm";
const TONE: Record<RowTone, string> = {
  accent: "bg-accent-soft text-accent-strong",
  dusk: "bg-dusk-soft text-dusk",
  people: "bg-people-soft text-people",
  ink: "bg-sunken text-ink-muted",
  warm: "bg-warm-soft text-warm",
};

/**
 * A titled list of rows: plans, journeys, places, people, updates. Every list in Mira uses this, so a
 * row on Journeys looks exactly like one in "Mira noticed" on Home or in You.
 */
export function RowList({ label, id, children, className, action }: { label: string; id: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 id={id} className="m-label">{label}</h2>
        {action}
      </div>
      <ul className="mt-2.5 space-y-2.5">{children}</ul>
    </section>
  );
}

/**
 * One row: a tinted icon tile, an eyebrow (with its evidence glyph when the row states a fact), a title
 * and one line of detail. Tapping the row opens it; an optional quiet trailing action (delete, forget)
 * replaces the chevron at the end.
 */
export function Row({ icon, tone = "accent", eyebrow, kind, title, detail, href, onClick, trailing, ariaLabel, wrap = false, mark }: {
  icon: string;
  tone?: RowTone;
  eyebrow?: React.ReactNode;
  kind?: EvidenceKind;
  title: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  ariaLabel?: string;
  /** Show the whole detail (a message) instead of one truncated line. */
  wrap?: boolean;
  /** A small accent dot for something new. */
  mark?: boolean;
}) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      <span aria-hidden className={cx("grid size-10 shrink-0 place-items-center rounded-xl", TONE[tone])}><Icon name={icon} className="size-5" /></span>
      <span className="min-w-0 flex-1">
        {eyebrow ? <span className="m-label flex items-center gap-1.5">{kind ? <EvidenceGlyph kind={kind} /> : null}<span className="truncate">{eyebrow}</span></span> : null}
        <span className="block truncate font-semibold">{title}</span>
        {detail ? <span className={cx("block text-[0.8125rem] text-ink-muted", wrap ? "leading-snug" : "truncate")}>{detail}</span> : null}
      </span>
      {mark ? <span aria-label="New" className="size-2.5 shrink-0 rounded-full bg-accent" /> : null}
      {interactive && !trailing ? <Icon name="chevron" className="size-4 shrink-0 text-ink-subtle" /> : null}
    </>
  );
  const main = "flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left";
  return (
    <li className="m-card flex items-stretch overflow-hidden">
      {href ? <Link href={href} onClick={onClick} aria-label={ariaLabel} className={cx(main, "m-press")}>{body}</Link>
        : onClick ? <button type="button" onClick={onClick} aria-label={ariaLabel} className={cx(main, "m-press")}>{body}</button>
        : <div className={main}>{body}</div>}
      {trailing ? <div className="flex shrink-0 items-center pr-1.5">{trailing}</div> : null}
    </li>
  );
}

/** The quiet icon action that sits at the end of a row (delete, forget, remove). */
export function RowAction({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="m-press grid size-11 place-items-center rounded-full text-ink-subtle hover:bg-sunken hover:text-ink disabled:opacity-40">
      <Icon name={icon} className="size-[18px]" />
    </button>
  );
}

/**
 * A settings or facts group: the same label as RowList over one card with divided rows — the shape the
 * evidence ledger already uses. Lists of things use RowList; groups of choices and facts use Group.
 */
export function Group({ label, id, children, action, className, note }: { label: string; id: string; children: React.ReactNode; action?: React.ReactNode; className?: string; note?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cx("scroll-mt-6", className)}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="m-label">{label}</h2>
        {action}
      </div>
      <div className="m-card mt-2.5 divide-y divide-line/70 overflow-hidden">{children}</div>
      {note ? <p className="m-meta mt-2 px-1">{note}</p> : null}
    </section>
  );
}

/** One line inside a Group: tinted icon, title, optional detail, and a control or chevron at the end. */
export function GroupRow({ icon, tone = "accent", title, detail, href, onClick, end, art, ariaLabel }: { icon?: string; tone?: RowTone; title: React.ReactNode; detail?: React.ReactNode; href?: string; onClick?: () => void; end?: React.ReactNode; art?: React.ReactNode; ariaLabel?: string }) {
  const body = (
    <>
      {art ?? (icon ? <span aria-hidden className={cx("grid size-9 shrink-0 place-items-center rounded-xl", TONE[tone])}><Icon name={icon} className="size-[18px]" /></span> : null)}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {detail ? <span className="block text-[0.8125rem] leading-snug text-ink-muted">{detail}</span> : null}
      </span>
      {end ?? ((href || onClick) ? <Icon name="chevron" className="size-4 shrink-0 text-ink-subtle" /> : null)}
    </>
  );
  const cls = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left";
  if (href) return <Link href={href} aria-label={ariaLabel} className={cx(cls, "m-press hover:bg-sunken/50")}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} aria-label={ariaLabel} className={cx(cls, "m-press hover:bg-sunken/50")}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** The on/off switch used everywhere a setting is binary. */
export function Toggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className="shrink-0 rounded-full disabled:opacity-50">
      <span aria-hidden className={cx("relative block h-7 w-12 rounded-full transition-colors", on ? "bg-accent" : "bg-line-strong")}>
        <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

/**
 * Choice chips. One-of-many (radio) is Plan's pill: the chosen one filled. Many-of-many (switch) is a soft
 * tint with a check, so a row of things that are on reads calm instead of a wall of colour.
 */
export function Chip({ on, children, onClick, disabled, role = "radio", icon }: { on: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean; role?: "radio" | "switch" | "button"; icon?: string }) {
  const multi = role === "switch";
  const look = on ? (multi ? "bg-accent-soft text-accent-strong ring-accent/30" : "bg-accent text-accent-ink ring-accent") : multi ? "bg-surface text-ink-subtle ring-line" : "bg-surface text-ink-muted ring-line-strong";
  return (
    <button type="button" role={role} aria-checked={role === "button" ? undefined : on} aria-pressed={role === "button" ? on : undefined} disabled={disabled} onClick={onClick} className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 disabled:opacity-50", look)}>
      {multi ? <Icon name={on ? "check" : (icon ?? "plus")} className="size-4" /> : icon ? <Icon name={icon} className="size-4" /> : null}{children}
    </button>
  );
}
