"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * One-way per-device flags in localStorage ("dismissed this tip"). Reads as `true`
 * during server render so nothing flashes in and then disappears.
 */
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const memory = new Set<string>(); // fallback when storage is blocked (private mode, strict settings)
function read(key: string): boolean {
  if (memory.has(key)) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function useFlag(key: string): { value: boolean; set: () => void } {
  const value = useSyncExternalStore(subscribe, () => read(key), () => true);
  const set = useCallback(() => {
    memory.add(key);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private mode: hidden for this visit only */
    }
    listeners.forEach((l) => l());
  }, [key]);
  return { value, set };
}
