"use client";

import type { RouteLighting } from "@/domain/lighting";
import type { HelpPoint } from "@/domain/help-points";
import { lightingLine } from "./LightingSummary";
import { helpPointsLine } from "./HelpPointList";
import { cx } from "@/components/ui/cx";

export interface RouteOption {
  route: { meters: number; minutes: number; geometry: Array<[number, number]>; approximate: boolean };
  lighting: RouteLighting | null;
  helpPoints: HelpPoint[];
}

const fmtM = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * Walking options compared on context, never on verdicts (blueprint §5A): ordered by time,
 * each with its lighting (including the unknown share) and Help Points. Nothing here is
 * ranked by "safety"; she chooses.
 */
export function RouteOptions({ options, selected, onSelect }: { options: RouteOption[]; selected: number; onSelect: (i: number) => void }) {
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
                {o.route.minutes} min · {fmtM(o.route.meters)}
                {i === 0 ? <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-muted">Fastest</span> : null}
              </span>
              <span className="block text-sm text-ink-muted">{lightingLine(o.lighting)}</span>
              <span className="block text-sm text-ink-muted">{helpPointsLine(o.helpPoints)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ink-subtle">Not a safety rating. You know your way best.</p>
    </fieldset>
  );
}
