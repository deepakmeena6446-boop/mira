"use client";

import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { setThemePref, useDaypart, useThemePref } from "@/lib/daypart-store";
import type { ThemePref } from "@/domain/daypart";

const LABEL = { dawn: "sunrise", day: "daytime", evening: "evening", night: "night" } as const;
const OPTIONS: Array<{ value: ThemePref; label: string; icon: string }> = [
  { value: "auto", label: "Auto", icon: "clock" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "eye" },
];

/** Auto follows the time of day (sunrise → day → evening → night); Light/Dark pin it. */
export function AppearancePicker() {
  const pref = useThemePref();
  const daypart = useDaypart();
  return (
    <div className="px-4 py-3.5">
      <p id="appearance-label" className="font-semibold">
        Appearance
      </p>
      <p className="text-[0.8125rem] text-ink-muted">
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
            <span className="inline-flex items-center gap-1.5"><Icon name={o.icon} className="size-4" /> {o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
