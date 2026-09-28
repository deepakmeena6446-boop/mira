"use client";

import { useMemo, useState } from "react";
import type { EvidenceState } from "@/domain/evidence-state";
import { createPortal } from "react-dom";
import { useOverlay } from "@/lib/use-overlay";
import { useClock } from "@/lib/location-store";
import { useCountry } from "@/lib/locale-store";
import { HELP_CLASSES, SOURCE_NAME, helpWeightsFor, hoursLine, isNight, rankHelpPoints, type HelpClass, type HelpPoint, type RankedHelpPoint } from "@/domain/help-points";
import { localTime } from "@/domain/opening-hours";
import { Icon } from "@/components/ui/Icon";

/** How many places show before "Show more" (the ones the server looked up hours for). */
const FIRST = 5;

/**
 * "Help Points near me": the same deterministic ranking as the unsafe sheet (situation
 * "nearby"), as a calm list, with each place's hours state and its source.
 */
export function HelpNearSheet({
  open,
  onClose,
  me,
  points,
  evidence,
  failed,
  onRetry,
  loading,
  exclude,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  me: { lat: number; lon: number } | null;
  points: HelpPoint[];
  evidence?: EvidenceState<HelpPoint[]> | null;
  failed?: boolean;
  onRetry?: () => void;
  loading: boolean;
  exclude?: readonly HelpClass[];
  onPick: (p: RankedHelpPoint) => void;
}) {
  useOverlay(open, onClose);
  const clock = useClock();
  const locale = useCountry();
  const [only, setOnly] = useState<HelpClass | null>(null);
  const [all, setAll] = useState(false);
  const minuteKey = clock ? Math.floor(clock.getTime() / 60_000) : 0;
  const weights = useMemo(() => helpWeightsFor(locale.iso), [locale.iso]);
  const ranked = useMemo(() => {
    if (!me) return [];
    const at = minuteKey ? new Date(minuteKey * 60_000) : null;
    return rankHelpPoints(points, me, {
      situation: "nearby",
      night: isNight((at ?? new Date()).getHours()),
      now: at ? localTime(at) : undefined,
      at: at?.getTime(),
      exclude,
      weights,
    });
  }, [points, me, minuteKey, exclude, weights]);
  if (!open) return null;
  const classes = [...new Set(ranked.map((p) => p.cls))];
  const filtered = only && classes.includes(only) ? ranked.filter((p) => p.cls === only) : ranked;
  const shown = all ? filtered : filtered.slice(0, FIRST);
  const sources = [...new Set(ranked.map((p) => SOURCE_NAME[p.source]))];
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="near-h" className="fixed inset-0 z-50 flex items-end justify-center bg-scrim animate-fade sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-lg)] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[var(--radius-lg)]">
        <div className="flex items-center gap-3">
          <h2 id="near-h" className="flex-1 text-xl font-semibold">
            Help Points near you
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-sunken">
            <Icon name="close" className="size-4" />
          </button>
        </div>
        {!me ? (
          <p className="mt-3 text-sm text-ink-muted">Turn on location to see Help Points near you.</p>
        ) : loading ? (
          <p className="mt-3 text-sm text-ink-muted">Finding Help Points near you…</p>
        ) : failed || evidence?.state === "failed" ? (
          <div role="status" className="mt-3 text-sm text-ink-muted"><p>Mira couldn&apos;t check Help Points right now.</p>{onRetry ? <button type="button" onClick={onRetry} className="mt-2 min-h-11 font-bold text-accent">Retry</button> : null}</div>
        ) : !ranked.length ? (
          <p className="mt-3 text-sm text-ink-muted">No mapped Help Points were found from the sources checked. Other places may exist.</p>
        ) : (
          <>
            {classes.length > 1 ? (
              <div role="group" aria-label="Show only" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {[null, ...classes].map((c) => (
                  <button
                    key={c ?? "all"}
                    type="button"
                    aria-pressed={only === c}
                    onClick={() => setOnly(c)}
                    className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-semibold ${only === c ? "bg-accent text-accent-ink" : "bg-sunken text-ink-muted"}`}
                  >
                    {c ? `${HELP_CLASSES[c].emoji} ${HELP_CLASSES[c].label}` : "All"}
                  </button>
                ))}
              </div>
            ) : null}
            <ul className="mt-2 divide-y divide-line">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
                    <span aria-hidden className="text-xl">
                      {HELP_CLASSES[p.cls].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {HELP_CLASSES[p.cls].label} · about {p.minutes} min · {hoursLine(p)}
                      </span>
                    </span>
                    <Icon name="chevron" className="size-4 text-ink-subtle" />
                  </button>
                </li>
              ))}
            </ul>
            {!all && filtered.length > FIRST ? (
              <button type="button" onClick={() => setAll(true)} className="mt-1 min-h-11 text-sm font-bold text-accent">
                Show {filtered.length - FIRST} more
              </button>
            ) : null}
          </>
        )}
        {evidence?.state === "partial" ? <p role="status" className="mt-2 text-xs text-ink-muted">Some sources couldn&apos;t be checked. Showing available results.</p> : null}
        {ranked.length ? (
          <p className="mt-3 text-xs text-ink-subtle">
            Kinds of places that usually have people or staff around, from {sources.join(" and ")}. Places listed as closed now are left out. Hours are as listed by the source; Mira can&apos;t confirm who&apos;s there.
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
