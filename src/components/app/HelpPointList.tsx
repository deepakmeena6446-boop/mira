"use client";

import { useState } from "react";
import { HELP_CLASSES, SOURCE_NAME, hoursLine, minutesIn, type HelpPoint } from "@/domain/help-points";
import { localTime, openState } from "@/domain/opening-hours";
import { Icon } from "@/components/ui/Icon";
import type { RouteOption } from "./RouteOptions";
import { lightingLine, lightingWhy } from "./LightingSummary";
import { ContextRow } from "./ContextRow";

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
                        {HELP_CLASSES[p.cls].label} · {minutesIn(p.alongM ?? 0)} · {hoursLine({ ...p, open: openState(p.schedule, localTime(new Date()), Math.round((p.alongM ?? 0) / 75)) })}
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

/** Why "no Help Points" may just be missing map data (shown in one tap). */
export const NO_HELP_WHY =
  "MIRA looks for places that are usually staffed (hospitals, police, stations, pharmacies, fuel stations, hotels) close to the way. None are on the map here, which may only mean the map has no data yet. Adding missing places to OpenStreetMap helps everyone.";

/**
 * Two short lines above "Start with MIRA": the route's lighting and its Help Points, facts only,
 * with the unknown share always shown and why it's unknown one tap away. Details sit below.
 */
export function RouteContextLines({ option }: { option: RouteOption }) {
  const first = option.helpPoints[0];
  return (
    <dl className="mt-3" aria-label="What's known about this way">
      <ContextRow label="Lighting" why={lightingWhy(option.lighting)}>
        {lightingLine(option.lighting)}
      </ContextRow>
      <ContextRow label="Help" why={first ? undefined : NO_HELP_WHY}>
        {helpPointsLine(option.helpPoints)}
        {first ? (
          <span className="text-ink-muted">
            {" "}
            · first: {first.name}, {minutesIn(first.alongM ?? 0)}
          </span>
        ) : null}
      </ContextRow>
    </dl>
  );
}
