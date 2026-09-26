"use client";

import { useSyncExternalStore } from "react";
import { UNKNOWN_COUNTRY, type CountryContext } from "@/domain/country-context";

/**
 * The Country Context for where she is (from /api/geo/reverse), held in memory only. Until it is
 * known, there is no emergency number: the Emergency control explains that before dialling.
 */
export type { CountryContext } from "@/domain/country-context";
/** @deprecated the Country Context; kept as an alias for older imports. */
export type ClientLocale = CountryContext;

let state: CountryContext = UNKNOWN_COUNTRY;
const listeners = new Set<() => void>();

export function setCountry(next: CountryContext | null | undefined) {
  if (!next || JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  listeners.forEach((l) => l());
}
/** @deprecated use setCountry */
export const setLocale = setCountry;

export function useCountry(): CountryContext {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => UNKNOWN_COUNTRY,
  );
}
/** @deprecated use useCountry */
export const useLocale = useCountry;

/** The phone's own IANA time zone (phones set it from the network), for "arrive around…" times. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
