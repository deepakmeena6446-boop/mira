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
export function Row({ icon, tone = "accent", eyebrow, kind, title, detail, href, onClick, trailing, ariaLabel }: {
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
}) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      <span aria-hidden className={cx("grid size-10 shrink-0 place-items-center rounded-xl", TONE[tone])}><Icon name={icon} className="size-5" /></span>
      <span className="min-w-0 flex-1">
        {eyebrow ? <span className="m-label flex items-center gap-1.5">{kind ? <EvidenceGlyph kind={kind} /> : null}<span className="truncate">{eyebrow}</span></span> : null}
        <span className="block truncate font-semibold">{title}</span>
        {detail ? <span className="block truncate text-[0.8125rem] text-ink-muted">{detail}</span> : null}
      </span>
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
