"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useCountry } from "@/lib/locale-store";
import { useOverlay } from "@/lib/use-overlay";
import { GSM_EMERGENCY, emergencyDial } from "@/domain/country-context";

/**
 * Always-reachable emergency control. It opens the phone's own dialler with the emergency number
 * for the country she is in (Country Context, cited per country). No AI, no network, no MIRA call.
 *
 * - Number known: one tap dials it.
 * - Not known (no profile for this country, or location not known yet): the first tap explains
 *   that MIRA doesn't know the local number and what dialling 112 does, then she chooses. MIRA
 *   never silently substitutes another country's number.
 *
 * Calm on purpose: neutral colours, no siren, but high contrast and a 44 px target.
 */
export function EmergencyPill({ className, variant = "pill" }: { className?: string; variant?: "pill" | "block" | "link" }) {
  const country = useCountry();
  const dial = emergencyDial(country);
  const [explain, setExplain] = useState(false);
  const styles = {
    pill: "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-extrabold text-ink shadow-[var(--shadow-card)]",
    block: "flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-ink px-3 text-[0.95rem] font-extrabold text-canvas",
    link: "font-bold text-ink underline",
  }[variant];
  const icon = variant === "link" ? null : <Icon name="phone" className={variant === "block" ? "size-5" : "size-4"} />;

  if (dial.known) {
    return (
      <a href={`tel:${dial.number}`} aria-label={`Emergency call, ${dial.number}`} className={cx(styles, className)}>
        {icon}
        <span>{variant === "link" ? `call ${dial.number}` : `Emergency ${dial.number}`}</span>
      </a>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setExplain(true)} aria-haspopup="dialog" className={cx(styles, className)}>
        {icon}
        <span>{variant === "link" ? "call emergency services" : "Emergency"}</span>
      </button>
      {explain ? <UnknownNumberSheet onClose={() => setExplain(false)} countryName={country.countryName} /> : null}
    </>
  );
}

function UnknownNumberSheet({ onClose, countryName }: { onClose: () => void; countryName: string | null }) {
  useOverlay(true, onClose);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="emergency-h" className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgb(10_6_24/0.5)] animate-fade sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-[2rem] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[2rem]">
        <h2 id="emergency-h" className="text-xl font-extrabold">
          Emergency
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {countryName ? `MIRA doesn't have a checked emergency number for ${countryName} yet. ` : "MIRA doesn't know which country you're in yet, so it can't show the local emergency number. "}
          Mobile phones are required to treat {GSM_EMERGENCY.number} as an emergency number, so most networks connect it to local emergency services. If you know the local number, use that.
        </p>
        <a href={`tel:${GSM_EMERGENCY.number}`} className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-lg font-extrabold text-canvas">
          <Icon name="phone" className="size-5" /> Call {GSM_EMERGENCY.number}
        </a>
        <p className="mt-2 text-center text-xs text-ink-subtle">Opens your phone&apos;s dialler. MIRA doesn&apos;t call or alert anyone for you. ({GSM_EMERGENCY.standard})</p>
        <button type="button" onClick={onClose} className="mt-3 min-h-11 w-full rounded-full font-bold text-ink-muted hover:bg-sunken">
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
