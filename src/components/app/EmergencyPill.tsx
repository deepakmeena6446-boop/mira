"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useT } from "@/lib/i18n";
import { countryWasChosen, useCountry, useCountryConfirmedAt } from "@/lib/locale-store";
import { ChooseCountry } from "./ChooseCountry";
import { useOverlay, useScrimClose } from "@/lib/use-overlay";
import { emergencyActions, emergencyStatusNote, noNumberReason, type CountryContext } from "@/domain/country-context";
import { clockIn } from "@/domain/daylight";

/** Cited country actions only. A direct dial is reserved for a verified all-service number;
 * service-specific and unknown profiles open a deterministic options sheet. No model call.
 */
export function EmergencyPill({ className, variant = "pill" }: { className?: string; variant?: "pill" | "quiet" | "block" | "link" }) {
  const country = useCountry();
  const actions = emergencyActions(country);
  const direct = actions.length === 1 && actions[0].scope === "all" ? actions[0] : null;
  const [explain, setExplain] = useState(false);
  const t = useT();
  const styles = {
    pill: "inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink shadow-[var(--shadow-float)]",
    quiet: "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[0.8125rem] font-semibold text-ink ring-[1.5px] ring-ink/80",
    block: "flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-button)] bg-ink px-3 text-[0.95rem] font-semibold text-canvas",
    link: "font-semibold text-ink underline",
  }[variant];
  const icon = variant === "link" ? null : <Icon name="phone" className={variant === "block" ? "size-5" : variant === "quiet" ? "size-3.5" : "size-4"} />;

  if (direct) {
    return <a href={`tel:${direct.number}`} aria-label={`Emergency call, ${direct.number}`} className={cx(styles, className)}>{icon}<span>{variant === "link" ? `call ${direct.number}` : `Emergency ${direct.number}`}</span></a>;
  }
  return <>
    {/* In the compact header the unknown-country label is just "Emergency" so the Support pair stays on one line
        beside any title; the accessible name still says it opens options. */}
    <button type="button" data-early-tap="emergency" onClick={() => setExplain(true)} aria-haspopup="dialog" aria-label={variant === "quiet" && !(actions.length === 1 && actions[0].scope === "service") ? "Emergency options" : undefined} className={cx(styles, className)}>
      {icon}<span>{actions.length === 1 && actions[0].scope === "service" ? `${actions[0].label} ${actions[0].number}` : variant === "quiet" ? t("support.emergency") : "Emergency options"}</span>
    </button>
    <EmergencyOptionsSheet open={explain} onClose={() => setExplain(false)} country={country} actions={actions} />
  </>;
}

/**
 * When the number shown comes from the remembered country, not a fresh lookup: say which country and when,
 * so a traveller who crossed a border knows to check. Nothing when the lookup is fresh.
 */
export function LastConfirmedNote({ className }: { className?: string }) {
  const country = useCountry();
  const confirmedAt = useCountryConfirmedAt();
  if (!confirmedAt || !country.countryName) return null;
  if (countryWasChosen()) return <p className={cx("text-xs text-ink-muted", className)}>Numbers for {country.countryName}, the country you chose. If you&apos;re somewhere else, choose again in You, or use your phone&apos;s own emergency call.</p>;
  return <p className={cx("text-xs text-ink-muted", className)}>Numbers for {country.countryName}, where Mira last confirmed your phone was {confirmedWhen(confirmedAt)}. If you&apos;ve crossed a border since, use your phone&apos;s own emergency call.</p>;
}

/** "3 min ago", "today at 9:05 PM", "yesterday at 9:05 PM" — a bare time could be read as today. */
export function confirmedWhen(at: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "a minute ago" : `${minutes} min ago`;
  const time = clockIn(at);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return day(new Date(at)) === day(new Date(now)) ? `today at ${time}` : `yesterday at ${time}`;
}

/** Stays mounted and flips `open`: mounting already-open made React's dev double-effect pop its own history entry and close it at once. */
function EmergencyOptionsSheet({ open, onClose, country, actions }: { open: boolean; onClose: () => void; country: CountryContext; actions: ReturnType<typeof emergencyActions> }) {
  const note = emergencyStatusNote(country);
  useOverlay(open, onClose);
  const scrimClose = useScrimClose(open, onClose);
  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="emergency-h" className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim animate-fade sm:items-center" onClick={scrimClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full min-w-0 max-w-[min(28rem,100vw)] overflow-y-auto overscroll-contain rounded-t-[var(--radius-lg)] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[var(--radius-lg)]">
        <h2 id="emergency-h" className="text-xl font-semibold">Emergency call options</h2>
        {actions.length ? <>
          <p className="mt-2 text-sm text-ink-muted">Choose the service you need. Mira opens your phone&apos;s dialler; it does not make the call.</p>
          <ul className="mt-4 space-y-2">{actions.map((n) => <li key={n.number}>
            <a href={`tel:${n.number}`} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-ink px-4 font-semibold text-canvas"><span>{n.label}</span><span>{n.number}</span></a>
            {n.qualification ? <p className="mt-1 text-xs text-ink-muted">{n.qualification}</p> : null}
          </li>)}</ul>
          <LastConfirmedNote className="mt-3" />
          {note ? <p className="mt-3 text-xs text-ink-muted">{note}</p> : null}
        </> : <>
          <p className="mt-2 text-sm text-ink-muted">{noNumberReason(country)} If you know the local number, use your phone&apos;s dialler.</p>
          {!country.iso ? <ChooseCountry className="mt-4" /> : null}
        </>}
        <button type="button" onClick={onClose} className="mt-3 min-h-12 w-full rounded-full font-semibold text-ink-muted hover:bg-sunken">Close</button>
      </div>
    </div>, document.body,
  );
}
