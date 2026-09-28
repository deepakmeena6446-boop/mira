"use client";

import { cx } from "@/components/ui/cx";
import { setThemePref, useDaypart, useThemePref } from "@/lib/daypart-store";
import type { ThemePref } from "@/domain/daypart";

const LABEL = { dawn: "sunrise", day: "daytime", evening: "evening", night: "night" } as const;
const OPTIONS: Array<{ value: ThemePref; label: string; emoji: string }> = [
  { value: "auto", label: "Auto", emoji: "🌗" },
  { value: "light", label: "Light", emoji: "☀️" },
  { value: "dark", label: "Dark", emoji: "🌙" },
];

/** Auto follows the time of day (sunrise → day → evening → night); Light/Dark pin it. */
export function AppearancePicker() {
  const pref = useThemePref();
  const daypart = useDaypart();
  return (
    <div className="px-5 py-4">
      <p id="appearance-label" className="font-semibold">
        Appearance
      </p>
      <p className="text-sm text-ink-muted">
        {pref === "auto" ? `Follows the time of day${daypart ? ` — it's ${LABEL[daypart]} colors now` : ""}.` : pref === "light" ? "Always light." : "Always dark."}
      </p>
      <div role="radiogroup" aria-labelledby="appearance-label" className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-sunken p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={pref === o.value}
            onClick={() => setThemePref(o.value)}
            className={cx("min-h-11 rounded-xl text-sm font-semibold transition-colors", pref === o.value ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-muted")}
          >
            <span aria-hidden>{o.emoji}</span> {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
