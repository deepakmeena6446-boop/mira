"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DAYPART_THEME_COLOR, THEME_PREF_KEY, effectiveDaypart, type Daypart, type ThemePref } from "@/domain/daypart";
import { useClock } from "./location-store";

/** Theme preference (auto / light / dark), kept per device in localStorage. */
const prefListeners = new Set<() => void>();
function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_PREF_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}
function subscribePref(l: () => void) {
  prefListeners.add(l);
  return () => prefListeners.delete(l);
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribePref, readPref, () => "auto");
}

export function setThemePref(p: ThemePref) {
  try {
    if (p === "auto") localStorage.removeItem(THEME_PREF_KEY);
    else localStorage.setItem(THEME_PREF_KEY, p);
  } catch {
    /* private mode: still applies for this visit */
  }
  prefListeners.forEach((l) => l());
}

/** The daypart the app is showing right now (null during server render). */
export function useDaypart(): Daypart | null {
  const now = useClock();
  const pref = useThemePref();
  return now ? effectiveDaypart(now.getHours(), pref) : null;
}

/** Keeps <html data-daypart> and the browser-chrome color in step as the day moves on. */
export function DaypartSync() {
  const d = useDaypart();
  useEffect(() => {
    if (!d) return;
    document.documentElement.dataset.daypart = d;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = DAYPART_THEME_COLOR[d]));
  }, [d]);
  return null;
}
