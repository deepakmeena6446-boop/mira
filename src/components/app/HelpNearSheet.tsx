"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "@/lib/use-overlay";
import { HELP_CLASSES, SOURCE_NAME, hoursLine, isNight, rankHelpPoints, type HelpClass, type HelpPoint, type RankedHelpPoint } from "@/domain/help-points";
import { localTime } from "@/domain/opening-hours";
import { Icon } from "@/components/ui/Icon";

/** "Help Points near me": the same deterministic ranking as the unsafe sheet, as a calm list. */
export function HelpNearSheet({
  open,
  onClose,
  me,
  points,
  loading,
  exclude,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  me: { lat: number; lon: number } | null;
  points: HelpPoint[];
  loading: boolean;
  exclude?: readonly HelpClass[];
  onPick: (p: RankedHelpPoint) => void;
}) {
  useOverlay(open, onClose);
  const ranked = useMemo(() => {
    const now = new Date();
    return me ? rankHelpPoints(points, me, { night: isNight(now.getHours()), now: localTime(now), exclude }) : [];
  }, [points, me, exclude]);
  if (!open) return null;
  const sources = [...new Set(ranked.map((p) => SOURCE_NAME[p.source]))];
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="near-h" className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(10_6_24/0.45)] animate-fade sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[2rem]">
        <div className="flex items-center gap-3">
          <h2 id="near-h" className="flex-1 text-xl font-extrabold">
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
        ) : !ranked.length ? (
          <p className="mt-3 text-sm text-ink-muted">None found close by (hospitals, police, stations, pharmacies, fuel, hotels). That may just mean the map has no data here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {ranked.map((p) => (
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
        )}
        {ranked.length ? <p className="mt-3 text-xs text-ink-subtle">Usually staffed kinds of places, from {sources.join(" and ")}. Places listed as closed now are left out. MIRA can&apos;t confirm who&apos;s there.</p> : null}
      </div>
    </div>,
    document.body,
  );
}
