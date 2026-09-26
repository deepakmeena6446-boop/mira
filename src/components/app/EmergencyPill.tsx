"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useCountry } from "@/lib/locale-store";
import { useOverlay } from "@/lib/use-overlay";
import { emergencyActions } from "@/domain/country-context";

/** Cited country actions only. A direct dial is reserved for a verified all-service number;
 * service-specific and unknown profiles open a deterministic options sheet. No model call.
 */
export function EmergencyPill({ className, variant = "pill" }: { className?: string; variant?: "pill" | "block" | "link" }) {
  const country = useCountry();
  const actions = emergencyActions(country);
  const direct = actions.length === 1 && actions[0].scope === "all" ? actions[0] : null;
  const [explain, setExplain] = useState(false);
  const styles = {
    pill: "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-extrabold text-ink shadow-[var(--shadow-card)]",
    block: "flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-ink px-3 text-[0.95rem] font-extrabold text-canvas",
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
    {explain ? <EmergencyOptionsSheet onClose={() => setExplain(false)} countryName={country.countryName ?? regionName(country.iso)} actions={actions} /> : null}
  </>;
}

/** "Peru" for "PE", from the browser's own region names (no data file needed); null when unknown. */
function regionName(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? null;
  } catch {
    return null;
  }
}

function EmergencyOptionsSheet({ onClose, countryName, actions }: { onClose: () => void; countryName: string | null; actions: ReturnType<typeof emergencyActions> }) {
  useOverlay(true, onClose);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="emergency-h" className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgb(10_6_24/0.5)] animate-fade sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-[2rem] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[2rem]">
        <h2 id="emergency-h" className="text-xl font-extrabold">Emergency call options</h2>
        {actions.length ? <>
          <p className="mt-2 text-sm text-ink-muted">Choose the service you need. MIRA opens your phone&apos;s dialler; it does not make the call.</p>
          <ul className="mt-4 space-y-2">{actions.map((n) => <li key={n.number}>
            <a href={`tel:${n.number}`} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-ink px-4 font-bold text-canvas"><span>{n.label}</span><span>{n.number}</span></a>
            {n.qualification ? <p className="mt-1 text-xs text-ink-muted">{n.qualification}</p> : null}
          </li>)}</ul>
        </> : <p className="mt-2 text-sm text-ink-muted">{countryName ? `MIRA could not verify a local emergency number for ${countryName}.` : "MIRA could not verify a local emergency number for your location."} If you know the local number, use your phone&apos;s dialler.</p>}
        <button type="button" onClick={onClose} className="mt-3 min-h-11 w-full rounded-full font-bold text-ink-muted hover:bg-sunken">Close</button>
      </div>
    </div>, document.body,
  );
}
