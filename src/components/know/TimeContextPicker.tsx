"use client";

import type { TimeContext } from "@/domain/time-bands";
import { cx } from "@/components/ui/cx";

const OPTIONS: Array<{ value: TimeContext; label: string }> = [
  { value: "now", label: "Now" },
  { value: "evening", label: "Evening" },
  { value: "late", label: "Late" },
];

/** Selects which time band's observations to show. Does not imply live conditions. */
export function TimeContextPicker({ value, onChange, disabled }: { value: TimeContext; onChange: (v: TimeContext) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1.5 font-semibold">
        Time of day <span className="text-sm font-normal text-ink-muted">for community observations</span>
      </legend>
      <div className="inline-flex rounded-full border border-line-strong bg-surface p-1">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cx(
              "inline-flex min-h-10 min-w-20 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-semibold",
              value === o.value ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent",
            )}
          >
            <input type="radio" name="time-context" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
