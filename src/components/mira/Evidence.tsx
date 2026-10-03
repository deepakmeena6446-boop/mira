import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * Mira's evidence grammar (docs/phase1-ux/01 §1). Every claim in a brief carries exactly one state,
 * with its own glyph AND label so colour is never the only signal:
 * - checked: a named source establishes it, at a stated time;
 * - estimate: calculated from stated assumptions;
 * - people: released community notes or walker votes;
 * - none: Mira has no source for this here (unavailable);
 * - nodata: the source was checked and has nothing (empty — never "none exist");
 * - failed: the check did not complete (retryable — never "nothing found").
 * There is deliberately no "good/bad" state.
 */
export type EvidenceKind = "checked" | "estimate" | "people" | "none" | "nodata" | "failed" | "pending";

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  checked: "Checked",
  estimate: "Estimate",
  people: "From people",
  none: "Not available",
  nodata: "No data",
  failed: "Couldn’t check",
  pending: "Checking",
};

export function EvidenceGlyph({ kind, className }: { kind: EvidenceKind; className?: string }) {
  const tone = kind === "people" ? "text-people" : kind === "checked" || kind === "estimate" ? "text-accent" : kind === "failed" ? "text-warm" : "text-ink-subtle";
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cx("size-3.5 shrink-0", tone, kind === "pending" && "animate-pulse", className)}>
      {kind === "checked" ? <circle cx="8" cy="8" r="5" fill="currentColor" /> : null}
      {kind === "estimate" ? <><circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 3.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor" /></> : null}
      {kind === "people" ? <><circle cx="5.6" cy="8" r="3.2" fill="currentColor" /><circle cx="10.8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" /></> : null}
      {kind === "none" || kind === "nodata" || kind === "pending" ? <circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2" /> : null}
      {kind === "failed" ? <><circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 5.6v3.2M8 10.6v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></> : null}
    </svg>
  );
}

export interface EvidenceItem {
  /** Stable key. */
  id: string;
  kind: EvidenceKind;
  /** What the claim is about, e.g. "Daylight", "Lighting", "Help Points". */
  topic: string;
  /** The claim itself, in plain words. */
  claim: string;
  /** Where it comes from and how fresh, e.g. "Solar calculation · approximate". */
  source?: string;
  icon?: string;
  /** Optional inline action (retry, open). */
  action?: { label: string; onClick: () => void };
}

/** One claim: topic icon, claim, state chip and source. */
export function EvidenceRow({ item }: { item: EvidenceItem }) {
  const muted = item.kind === "none" || item.kind === "nodata" || item.kind === "pending";
  return (
    <li className="flex gap-3 py-3.5">
      <span aria-hidden className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", item.kind === "people" ? "bg-people-soft text-people" : item.topic === "Daylight" || item.topic === "Lighting" ? "bg-dusk-soft text-dusk" : "bg-sunken text-ink-muted")}>
        <Icon name={item.icon ?? "info"} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="m-label">{item.topic}</p>
          <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-ink-subtle">
            <EvidenceGlyph kind={item.kind} />
            {EVIDENCE_LABEL[item.kind]}
          </p>
        </div>
        <p className={cx("mt-0.5 text-[0.9375rem] leading-snug", muted ? "text-ink-muted" : "text-ink")}>{item.claim}</p>
        {item.source ? <p className="mt-0.5 text-xs text-ink-subtle">{item.source}</p> : null}
        {item.action ? (
          <button type="button" onClick={item.action.onClick} className="mt-1 min-h-11 text-sm font-semibold text-accent-strong">
            {item.action.label}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** A brief's ledger: checked claims first, then what Mira could not see. Always ends honestly. */
export function EvidenceLedger({ items, title = "What Mira checked", label, className }: { items: EvidenceItem[]; title?: string; label?: string; className?: string }) {
  const order: EvidenceKind[] = ["checked", "estimate", "people", "pending", "failed", "nodata", "none"];
  const sorted = [...items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <section aria-label={label ?? title} className={cx("m-card px-4 pt-3.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-h">{title}</h3>
        <EvidenceKey />
      </div>
      <ul className="divide-y divide-line">{sorted.map((item) => <EvidenceRow key={item.id} item={item} />)}</ul>
    </section>
  );
}

/** A tiny, tappable legend so the glyphs teach themselves. */
export function EvidenceKey() {
  return (
    <details className="relative text-xs text-ink-subtle">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold [&::-webkit-details-marker]:hidden">
        <Icon name="info" className="size-4" /> How Mira labels
      </summary>
      <div className="absolute right-0 top-full z-10 w-64 rounded-2xl bg-surface p-3 text-ink shadow-[var(--shadow-float)] ring-1 ring-line">
        <ul className="space-y-2">
          {(["checked", "estimate", "people", "none", "failed"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2">
              <EvidenceGlyph kind={k} className="mt-0.5" />
              <span><strong className="font-semibold">{EVIDENCE_LABEL[k]}</strong> — {{ checked: "a named source says so, at a stated time.", estimate: "calculated, with the assumption shown.", people: "released notes or votes from people who were there.", none: "Mira has no source for this here.", failed: "the check didn’t finish; try again." }[k]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-ink-muted">Mira never scores a place or gives it a verdict.</p>
      </div>
    </details>
  );
}

/** A compact inline fact for option cards: glyph + short text. */
export function EvidenceChip({ kind, children }: { kind: EvidenceKind; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-ink-muted">
      <EvidenceGlyph kind={kind} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
