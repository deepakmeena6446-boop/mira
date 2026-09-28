"use client";

import { useState } from "react";
import type { EvidenceState } from "@/domain/evidence-state";
import { HELP_CLASSES, SOURCE_NAME, hoursLine, hoursState, isNight, minutesIn, type HelpPoint } from "@/domain/help-points";
import { localTime } from "@/domain/opening-hours";
import { Icon } from "@/components/ui/Icon";
import { HELP_ICON } from "./kinds";
import type { RouteOption } from "./RouteOptions";
import { lightingEvidenceLine, lightingWhy } from "./LightingSummary";
import { ContextRow } from "./ContextRow";

/** "4 Help Points along this journey" — a summary line (for option cards and the route sheet). */
export function helpPointsLine(points: HelpPoint[], evidence?: EvidenceState<HelpPoint[]>): string {
  if (evidence?.state === "failed") return "Mira couldn't check Help Points right now.";
  if (evidence?.state === "unavailable") return "Help Point mapping is unavailable here.";
  const base = points.length ? `${points.length} mapped Help Point${points.length === 1 ? "" : "s"} along the way` : "No mapped Help Points from sources checked";
  return evidence?.state === "partial" ? `${base} · Some sources couldn't be checked` : base;
}

/**
 * Hours for a place on the route, on the device's clock, for when she'd get there from the
 * start: "Open now · Google", "Listed 9 AM–9 PM · OpenStreetMap", "Hours not known"…
 */
function routeHoursLine(p: HelpPoint): string {
  const now = new Date();
  const hoursNow = hoursState(p, localTime(now), Math.round((p.alongM ?? 0) / 75), now.getTime());
  const unknown = hoursNow.kind === "unknown" || hoursNow.kind === "listed";
  return hoursLine({ ...p, hoursNow, mayBeClosed: unknown && isNight(now.getHours()) && HELP_CLASSES[p.cls].hoursMatter });
}

/**
 * Help Points along a route, in the order she'd pass them: class, where on the route, hours
 * exactly as the source states them ("hours not known" otherwise), and the source. Collapsed
 * to a summary by default so the route sheet stays short.
 */
export function HelpPointList({ points, evidence, onPick, defaultOpen = false }: { points: HelpPoint[]; evidence?: EvidenceState<HelpPoint[]>; onPick?: (p: HelpPoint) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const nearest = points[0];
  const sources = [...new Set(points.map((p) => SOURCE_NAME[p.source]))];
  return (
    <section className="mt-5" aria-label="Help Points along this route">
      <h3 className="text-[13px] font-medium text-ink-subtle">Help Points</h3>
      {!points.length ? (
        <p className="mt-2 text-sm text-ink-muted">{helpPointsLine(points, evidence)}. Other places may exist.</p>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2.5 text-left">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink">
              <Icon name={HELP_ICON[nearest.cls] ?? "pin"} className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{helpPointsLine(points, evidence)}</span>
              <span className="block truncate text-sm text-ink-muted">
                First: {nearest.name} · {HELP_CLASSES[nearest.cls].label}, {minutesIn(nearest.alongM ?? 0)}
              </span>
            </span>
            <Icon name="chevron" className={open ? "size-4 rotate-90 transition-transform" : "size-4 transition-transform"} />
          </button>
          {open ? (
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {points.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={!onPick} onClick={() => onPick?.(p)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left enabled:hover:bg-sunken">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink">
                      <Icon name={HELP_ICON[p.cls] ?? "pin"} className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {HELP_CLASSES[p.cls].label} · {minutesIn(p.alongM ?? 0)} · {routeHoursLine(p)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {evidence?.state === "partial" ? <p role="status" className="mt-2 text-xs text-ink-muted">Some Help Point sources couldn&apos;t be checked. Showing results that were available.</p> : null}
          <p className="mt-1.5 text-xs text-ink-subtle">Kinds of places that usually have people or staff around, from {sources.join(" and ")}. Hours are as listed; Mira can&apos;t confirm who&apos;s there or that they&apos;re open.</p>
        </>
      )}
    </section>
  );
}

/** Why "no Help Points" may just be missing map data (shown in one tap). */
export const NO_HELP_WHY =
  "Mira checks mapped types of places where help may be available near the way. No results from checked sources does not mean no places exist.";

/**
 * Two short lines above "Go with Mira": the route's lighting and its Help Points, facts only,
 * with the unknown share always shown and why it's unknown one tap away. Details sit below.
 */
export function RouteContextLines({ option }: { option: RouteOption }) {
  const first = option.helpPoints[0];
  return (
    <dl className="mt-3" aria-label="What's known about this way">
      <ContextRow label="Lighting" why={lightingWhy(option.lighting, option.lightingEvidence)}>
        {lightingEvidenceLine(option.lightingEvidence, option.lighting)}
      </ContextRow>
      <ContextRow label="Help" why={first ? undefined : NO_HELP_WHY}>
        {helpPointsLine(option.helpPoints, option.helpEvidence)}
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
