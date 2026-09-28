"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useCountry } from "@/lib/locale-store";
import { useOverlay } from "@/lib/use-overlay";
import { emergencyActions, emergencyStatusNote, noNumberReason, type CountryContext } from "@/domain/country-context";

/** Cited country actions only. A direct dial is reserved for a verified all-service number;
 * service-specific and unknown profiles open a deterministic options sheet. No model call.
 */
export function EmergencyPill({ className, variant = "pill" }: { className?: string; variant?: "pill" | "block" | "link" }) {
  const country = useCountry();
  const actions = emergencyActions(country);
  const direct = actions.length === 1 && actions[0].scope === "all" ? actions[0] : null;
  const [explain, setExplain] = useState(false);
  const styles = {
    pill: "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink shadow-[var(--shadow-float)]",
    block: "flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-button)] bg-ink px-3 text-[0.95rem] font-semibold text-canvas",
    link: "font-bold text-ink underline",
  }[variant];
  const icon = variant === "link" ? null : <Icon name="phone" className={variant === "block" ? "size-5" : "size-4"} />;

  if (direct) {
    return <a href={`tel:${direct.number}`} aria-label={`Emergency call, ${direct.number}`} className={cx(styles, className)}>{icon}<span>{variant === "link" ? `call ${direct.number}` : `Emergency ${direct.number}`}</span></a>;
  }
  return <>
    <button type="button" onClick={() => setExplain(true)} aria-haspopup="dialog" className={cx(styles, className)}>
      {icon}<span>{actions.length === 1 && actions[0].scope === "service" ? `${actions[0].label} ${actions[0].number}` : "Emergency options"}</span>
    </button>
    <EmergencyOptionsSheet open={explain} onClose={() => setExplain(false)} country={country} actions={actions} />
  </>;
}

/** Stays mounted and flips `open`: mounting already-open made React's dev double-effect pop its own history entry and close it at once. */
function EmergencyOptionsSheet({ open, onClose, country, actions }: { open: boolean; onClose: () => void; country: CountryContext; actions: ReturnType<typeof emergencyActions> }) {
  const note = emergencyStatusNote(country);
  useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="emergency-h" className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim animate-fade sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-[var(--radius-lg)] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[var(--radius-lg)]">
        <h2 id="emergency-h" className="text-xl font-semibold">Emergency call options</h2>
        {actions.length ? <>
          <p className="mt-2 text-sm text-ink-muted">Choose the service you need. Mira opens your phone&apos;s dialler; it does not make the call.</p>
          <ul className="mt-4 space-y-2">{actions.map((n) => <li key={n.number}>
            <a href={`tel:${n.number}`} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-ink px-4 font-bold text-canvas"><span>{n.label}</span><span>{n.number}</span></a>
            {n.qualification ? <p className="mt-1 text-xs text-ink-muted">{n.qualification}</p> : null}
          </li>)}</ul>
          {note ? <p className="mt-3 text-xs text-ink-muted">{note}</p> : null}
        </> : <p className="mt-2 text-sm text-ink-muted">{noNumberReason(country)} If you know the local number, use your phone&apos;s dialler.</p>}
        <button type="button" onClick={onClose} className="mt-3 min-h-11 w-full rounded-full font-bold text-ink-muted hover:bg-sunken">Close</button>
      </div>
    </div>, document.body,
  );
}
