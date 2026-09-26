"use client";

import { useSyncExternalStore } from "react";
import { EMERGENCY_NUMBER } from "@/domain/emergency";

/**
 * The Location Context for where she is (from /api/geo/reverse), held in memory only. Until it
 * is known, the emergency number is 112, which works on most mobile networks.
 */
export interface ClientLocale {
  iso: string | null;
  emergency: { number: string; label: string };
  confirmed: boolean;
  helplines: Array<{ number: string; name: string; hours: string | null }>;
  timezone: string | null;
}

const FALLBACK: ClientLocale = { iso: null, emergency: { number: EMERGENCY_NUMBER, label: "Emergency" }, confirmed: false, helplines: [], timezone: null };
let state: ClientLocale = FALLBACK;
const listeners = new Set<() => void>();

export function setLocale(next: ClientLocale | null | undefined) {
  if (!next || JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  listeners.forEach((l) => l());
}

export function useLocale(): ClientLocale {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => FALLBACK,
  );
}
