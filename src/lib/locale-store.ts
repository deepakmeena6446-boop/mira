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

/**
 * The last country a reviewed reverse lookup confirmed for this phone's own position — the country only,
 * never the point. It keeps Emergency's number on screen when the fresh lookup has lapsed: a cold open,
 * a failed lookup, a metro tunnel, standing still for two minutes (audit P0-1). Cleared on sign-out/delete.
 */
export interface LastKnownCountry { country: CountryContext; checkedAt: number; /** She picked it (location off), not a position lookup. */ chosen?: boolean }
const LAST_KNOWN_KEY = "mira.country.lastKnown";
let lastKnown: LastKnownCountry | null | undefined; // undefined: not read from storage yet
/** Where the remembered country was confirmed — memory only, never stored (no location history). */
let lastKnownPoint: Point | null = null;
/** A fresh fix this far from where the country was confirmed is evidence she may have crossed a border. */
export const LAST_KNOWN_DROP_M = 50_000;

function readLastKnown(): LastKnownCountry | null {
  if (lastKnown !== undefined) return lastKnown;
  lastKnown = null;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LAST_KNOWN_KEY);
    const parsed = raw ? (JSON.parse(raw) as LastKnownCountry) : null;
    if (parsed && typeof parsed.checkedAt === "number" && parsed.country?.iso) lastKnown = parsed;
  } catch { /* unreadable storage: no fallback, same as before */ }
  return lastKnown;
}
function saveLastKnown(country: CountryContext, checkedAt: number) {
  lastKnown = { country, checkedAt };
  try { localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(lastKnown)); } catch { /* memory copy still serves this session */ }
}
/**
 * She chose her country herself because Mira can't see where she is (location off; audit P03-003). Labelled as her
 * choice, never as where she is; a fresh position lookup replaces it. Same 24-hour rule as a remembered country.
 */
export function chooseCountry(country: CountryContext) {
  if (!country.iso) return;
  lastKnown = { country, checkedAt: Date.now(), chosen: true };
  lastKnownPoint = null;
  try { localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(lastKnown)); } catch { /* memory copy still serves this session */ }
  emit();
}
/** Whether the remembered country was her choice (not confirmed from a position). */
export function countryWasChosen(): boolean {
  return Boolean(readLastKnown()?.chosen);
}

/** Sign-out and account deletion: this phone stops remembering the country. */
export function forgetLastKnownCountry() {
  lastKnown = null;
  lastKnownPoint = null;
  try { localStorage.removeItem(LAST_KNOWN_KEY); } catch { /* nothing stored */ }
  emit();
}

/** A remembered country stands in for a fresh lookup for a day: yesterday's walk home, not last week's trip abroad. */
export const LAST_KNOWN_COUNTRY_MS = 24 * 3600_000;

/**
 * Whether a remembered country may still stand in for a fresh lookup, `now` ms since epoch. Returns
 * `saved.country` itself (the same object, so React's store snapshot stays stable) or null. A clock moved
 * backwards past the usual skew means the age can't be trusted.
 */
export function lastKnownCountry(saved: LastKnownCountry | null, now: number): CountryContext | null {
  if (!saved) return null;
  const age = now - saved.checkedAt;
  return age >= -10_000 && age < LAST_KNOWN_COUNTRY_MS ? saved.country : null;
}

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
  saveLastKnown(next, currentFix.checkedAt);
  lastKnownPoint = { ...currentFix.point };
  expiryTimer = setTimeout(clearCountry, Math.max(1, COUNTRY_FRESH_MS - (Date.now() - currentFix.checkedAt)));
  emit();
}
/** Drops the fresh lookup. The last known country (if still trusted) remains the fallback. */
export function clearCountry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  state = UNKNOWN_COUNTRY;
  fix = null;
  emit();
}
/** Movement invalidates the old jurisdiction before a new lookup can finish. */
export function invalidateCountryForLocation(point: Point | null, at = Date.now()) {
  // Far from where the remembered country was confirmed: don't keep offering its number (a new lookup will say).
  if (point && lastKnownPoint && haversineMeters(lastKnownPoint, point) > LAST_KNOWN_DROP_M) forgetLastKnownCountry();
  if (!point || !fix || at - fix.checkedAt >= COUNTRY_FRESH_MS || haversineMeters(fix.point, point) > COUNTRY_POSITION_RADIUS_M) clearCountry();
}
function freshCountry(at: number): CountryContext | null {
  return fix && at - fix.checkedAt >= -10_000 && at - fix.checkedAt < COUNTRY_FRESH_MS ? state : null;
}
export function currentCountry(at = Date.now()): CountryContext {
  return freshCountry(at) ?? lastKnownCountry(readLastKnown(), at) ?? UNKNOWN_COUNTRY;
}
/** When the country shown is the remembered one (not a fresh lookup): when it was confirmed. Null otherwise. */
export function countryConfirmedAt(at = Date.now()): number | null {
  if (freshCountry(at)) return null;
  const saved = readLastKnown();
  return saved && lastKnownCountry(saved, at) ? saved.checkedAt : null;
}
export const setLocale = setCountry;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useCountry(): CountryContext {
  return useSyncExternalStore(subscribe, currentCountry, () => UNKNOWN_COUNTRY);
}
export function useCountryConfirmedAt(): number | null {
  return useSyncExternalStore(subscribe, countryConfirmedAt, () => null);
}
export const useLocale = useCountry;
