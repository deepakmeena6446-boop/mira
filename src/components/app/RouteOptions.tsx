"use client";

import type { RouteLighting } from "@/domain/lighting";
import { walkMinutesTo, type HelpPoint } from "@/domain/help-points";
import { distanceUnits, formatDistance, type TravelMode } from "@/domain/travel-mode";
import { useCountry } from "@/lib/locale-store";
import { lightingLine } from "./LightingSummary";
import { NO_HELP_WHY, helpPointsLine } from "./HelpPointList";
import { ContextRow } from "./ContextRow";
import { cx } from "@/components/ui/cx";

export interface RouteOption {
  route: { meters: number; minutes: number; geometry: Array<[number, number]>; approximate: boolean };
  lighting: RouteLighting | null;
  helpPoints: HelpPoint[];
}

/**
 * Walking options compared on context, never on verdicts (blueprint §5A): ordered by time,
 * each with its lighting (including the unknown share) and Help Points. Nothing here is
 * ranked by "safety"; "Fastest" is the only label. She chooses.
 */
export function RouteOptions({ options, selected, onSelect }: { options: RouteOption[]; selected: number; onSelect: (i: number) => void }) {
  const units = distanceUnits(useCountry().iso);
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-bold uppercase tracking-wider text-ink-subtle">{options.length} ways to walk</legend>
      <div className="mt-2 grid gap-2">
        {options.map((o, i) => (
          <label
            key={i}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-surface px-4 py-3 shadow-[var(--shadow-card)]",
              i === selected ? "border-accent" : "border-transparent",
            )}
          >
            <input type="radio" name="route-option" className="mt-1.5 size-4 accent-[var(--color-accent)]" checked={i === selected} onChange={() => onSelect(i)} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">
                {o.route.minutes} min · {formatDistance(o.route.meters, units)}
                {i === 0 ? <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-muted">Fastest</span> : null}
              </span>
              <span className="block text-sm text-ink-muted">Lighting: {lightingLine(o.lighting)}</span>
              <span className="block text-sm text-ink-muted">{helpPointsLine(o.helpPoints)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ink-subtle">Not a safety rating. You know your way best.</p>
    </fieldset>
  );
}

/**
 * Context for a ride or transit journey: street lighting is about walking, so it says so in one
 * quiet line instead of a number; Help Points are the ones within a short walk of where she
 * arrives (the last walk), nearest first.
 */
export function ArrivalContextLines({ mode, arrivalHelp, dest }: { mode: Exclude<TravelMode, "walk">; arrivalHelp: HelpPoint[]; dest: { lat: number; lon: number } }) {
  const first = arrivalHelp[0];
  return (
    <dl className="mt-3" aria-label="What's known about this journey">
      <ContextRow label="Lighting">
        <span className="text-ink-muted">Street lighting is shown for walks, not {mode === "ride" ? "rides" : "transit"}.</span>
      </ContextRow>
      <ContextRow label="Help" why={first ? undefined : NO_HELP_WHY}>
        {first ? (
          <>
            {arrivalHelp.length} Help Point{arrivalHelp.length === 1 ? "" : "s"} near where you arrive
            <span className="text-ink-muted">
              {" "}
              · nearest: {first.name}, {walkMinutesTo(dest, first)} min walk
            </span>
          </>
        ) : (
          "No Help Points found near where you arrive"
        )}
      </ContextRow>
    </dl>
  );
}
