"use client";

import { useSyncExternalStore } from "react";
import { UNKNOWN_COUNTRY, type CountryContext } from "@/domain/country-context";
import { haversineMeters } from "@/domain/pilot";

export type { CountryContext } from "@/domain/country-context";
export type ClientLocale = CountryContext;
export const COUNTRY_FRESH_MS = 120_000;
export const COUNTRY_POSITION_RADIUS_M = 250;
type Point = { lat: number; lon: number };
export type CountryFix = { point: Point; checkedAt: number };
let state: CountryContext = UNKNOWN_COUNTRY;
let fix: CountryFix | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Only a reviewed reverse lookup for a fresh current position can create dial actions.
 * A destination profile or a response without position provenance stays non-actionable. */
export function setCountry(next: CountryContext | null | undefined, currentFix?: CountryFix) {
  if (!next?.iso || !currentFix || !Number.isFinite(currentFix.point.lat) || Math.abs(currentFix.point.lat) > 90 || !Number.isFinite(currentFix.point.lon) || Math.abs(currentFix.point.lon) > 180 || !Number.isFinite(currentFix.checkedAt) || Date.now() - currentFix.checkedAt < -10_000 || Date.now() - currentFix.checkedAt >= COUNTRY_FRESH_MS) {
    clearCountry();
    return;
  }
  if (expiryTimer) clearTimeout(expiryTimer);
  state = next;
  fix = { point: { ...currentFix.point }, checkedAt: currentFix.checkedAt };
  expiryTimer = setTimeout(clearCountry, Math.max(1, COUNTRY_FRESH_MS - (Date.now() - currentFix.checkedAt)));
  emit();
}
export function clearCountry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  state = UNKNOWN_COUNTRY;
  fix = null;
  emit();
}
/** Movement invalidates the old jurisdiction before a new lookup can finish. */
export function invalidateCountryForLocation(point: Point | null, at = Date.now()) {
  if (!point || !fix || at - fix.checkedAt >= COUNTRY_FRESH_MS || haversineMeters(fix.point, point) > COUNTRY_POSITION_RADIUS_M) clearCountry();
}
export function currentCountry(at = Date.now()): CountryContext {
  return fix && at - fix.checkedAt >= -10_000 && at - fix.checkedAt < COUNTRY_FRESH_MS ? state : UNKNOWN_COUNTRY;
}
export const setLocale = setCountry;
export function useCountry(): CountryContext {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, currentCountry, () => UNKNOWN_COUNTRY);
}
export const useLocale = useCountry;
export function deviceTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}
