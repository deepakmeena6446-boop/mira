"use client";

import { useState } from "react";
import { HELP_CLASSES, SOURCE_NAME, hoursLine, minutesIn, type HelpPoint } from "@/domain/help-points";
import { Icon } from "@/components/ui/Icon";
import type { RouteOption } from "./RouteOptions";
import { lightingLine } from "./LightingSummary";

/** "4 Help Points along this journey" — a summary line (for option cards and the route sheet). */
export function helpPointsLine(points: HelpPoint[]): string {
  if (!points.length) return "No Help Points found along the way";
  return `${points.length} Help Point${points.length === 1 ? "" : "s"} along the way`;
}

/**
 * Help Points along a route, in the order she'd pass them: class, where on the route, hours
 * exactly as the source states them ("hours not known" otherwise), and the source. Collapsed
 * to a summary by default so the route sheet stays short.
 */
export function HelpPointList({ points, onPick, defaultOpen = false }: { points: HelpPoint[]; onPick?: (p: HelpPoint) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const nearest = points[0];
  const sources = [...new Set(points.map((p) => SOURCE_NAME[p.source]))];
  return (
    <section className="mt-5" aria-label="Help Points along this route">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Help Points</h3>
      {!points.length ? (
        <p className="mt-2 text-sm text-ink-muted">None found along this way (hospitals, police, stations, pharmacies, fuel, hotels). That may just mean the map has no data here.</p>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface px-4 py-2.5 text-left shadow-[var(--shadow-card)]">
            <span aria-hidden className="text-xl">
              {HELP_CLASSES[nearest.cls].emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{helpPointsLine(points)}</span>
              <span className="block truncate text-sm text-ink-muted">
                First: {nearest.name} · {HELP_CLASSES[nearest.cls].label}, {minutesIn(nearest.alongM ?? 0)}
              </span>
            </span>
            <Icon name="chevron" className={open ? "size-4 rotate-90 transition-transform" : "size-4 transition-transform"} />
          </button>
          {open ? (
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)]">
              {points.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={!onPick} onClick={() => onPick?.(p)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left enabled:hover:bg-sunken">
                    <span aria-hidden className="text-xl">
                      {HELP_CLASSES[p.cls].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {HELP_CLASSES[p.cls].label} · {minutesIn(p.alongM ?? 0)} · {hoursLine(p)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1.5 text-xs text-ink-subtle">Places that are usually staffed, from {sources.join(" and ")}. MIRA can&apos;t confirm who&apos;s there or that they&apos;re open.</p>
        </>
      )}
    </section>
  );
}

/** Two short lines above "Start with MIRA": the route's lighting and its Help Points. Details sit below. */
export function RouteContextLines({ option }: { option: RouteOption }) {
  const first = option.helpPoints[0];
  return (
    <ul className="mt-3 space-y-1.5 text-sm" aria-label="What's known about this way">
      <li className="flex items-start gap-2">
        <span aria-hidden>💡</span>
        <span>
          <span className="font-semibold">Lighting:</span> <span className="text-ink-muted">{lightingLine(option.lighting)}</span>
        </span>
      </li>
      <li className="flex items-start gap-2">
        <span aria-hidden>{first ? HELP_CLASSES[first.cls].emoji : "📍"}</span>
        <span>
          <span className="font-semibold">{helpPointsLine(option.helpPoints)}</span>
          {first ? <span className="text-ink-muted"> · first: {first.name}, {minutesIn(first.alongM ?? 0)}</span> : null}
        </span>
      </li>
    </ul>
  );
}
