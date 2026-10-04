"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { haversineMeters } from "@/domain/pilot";
import { invalidateCountryForLocation, clearCountry, forgetLastKnownCountry } from "@/lib/locale-store";

/**
 * The user's current position, held in JS memory only (never persisted, never put in
 * URLs). Shared across screens so the app "just knows" where you are.
 */
export type LocStatus = "idle" | "asking" | "ok" | "denied" | "unavailable";
export interface LocState {
  status: LocStatus;
  point: { lat: number; lon: number; accuracy: number } | null;
  at: number;
  /** Human name of the area around `point` (e.g. "Kamla Nagar"), when known. */
  area: string | null;
}

export const LOCATION_FRESH_MS = 120_000;
export const LOCATION_MAX_ACCURACY_M = 100;
export function locationUsable(loc: LocState, options: { at?: number; maxAgeMs?: number; maxAccuracyM?: number } = {}): boolean {
  const age = (options.at ?? Date.now()) - loc.at;
  return loc.status === "ok" && Boolean(loc.point) && Number.isFinite(loc.point?.lat) && Math.abs(loc.point!.lat) <= 90 && Number.isFinite(loc.point?.lon) && Math.abs(loc.point!.lon) <= 180 && age >= -10_000 && age < (options.maxAgeMs ?? LOCATION_FRESH_MS) && Number.isFinite(loc.point?.accuracy) && loc.point!.accuracy >= 0 && loc.point!.accuracy <= (options.maxAccuracyM ?? LOCATION_MAX_ACCURACY_M);
}
/**
 * `at` is a render clock (useClock ticks every 30 s), which can only lag real time. A fix taken since its last
 * tick would look future-dated and be refused for up to 30 s — so never judge it against an earlier time than now.
 */
export function usableLocationPoint(loc: LocState, at = Date.now()): LocState["point"] { return locationUsable(loc, { at: Math.max(at, Date.now()) }) ? loc.point : null; }

let locationGeneration = 0;
let state: LocState = { status: "idle", point: null, at: 0, area: null };
export function currentLocation(): LocState { return state; }
const listeners = new Set<() => void>();
const set = (s: Partial<LocState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

export function clearLocation() {
  locationGeneration++;
  set({ status: "idle", point: null, at: 0, area: null });
  pendingDest = null;
  clearCountry();
  forgetLastKnownCountry(); // sign-out/delete: the next person on this phone starts from nothing
}

export function requestLocation(): Promise<LocState> {
  return new Promise((resolve) => {
    const generation = locationGeneration;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      set({ status: "unavailable", point: null, at: 0, area: null });
      clearCountry();
      return resolve(state);
    }
    if (state.status !== "ok") set({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (generation !== locationGeneration) return resolve(state);
        const point = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        set({ status: "ok", point, at: p.timestamp });
        if (!locationUsable(state)) { set({ status: "unavailable", point: null, area: null }); clearCountry(); }
        else invalidateCountryForLocation(point);
        resolve(state);
      },
      (e) => {
        if (generation !== locationGeneration) return resolve(state);
        set({ status: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable", point: null, at: 0, area: null });
        clearCountry();
        resolve(state);
      },
      // An explicit retry/confirmation must acquire a new fix, not return the
      // browser's cached point that may have just failed the origin check.
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}

/**
 * Her location choice, asked once on first open (owner decision 2026-10-04): "on" means every later open
 * fetches location by itself; "off" means Mira never asks again until she turns it on in You. Null: not asked yet.
 */
export type LocationChoice = "on" | "off" | null;
const LOCATION_CHOICE_KEY = "mira.location.skip";
const choiceListeners = new Set<() => void>();
export function locationChoice(): LocationChoice {
  try { const v = localStorage.getItem(LOCATION_CHOICE_KEY); return v === "0" ? "on" : v === "1" ? "off" : null; } catch { return null; }
}
export function rememberLocationChoice(useLocation: boolean) {
  try { localStorage.setItem(LOCATION_CHOICE_KEY, useLocation ? "0" : "1"); } catch { /* memory-only location still works */ }
  choiceListeners.forEach((l) => l());
}
export function shouldAutoLocate(): boolean {
  return locationChoice() === "on";
}
/** "unknown" during server render and hydration, so the first-open card never flashes. */
export function useLocationChoice(): LocationChoice | "unknown" {
  return useSyncExternalStore((l) => { choiceListeners.add(l); return () => { choiceListeners.delete(l); }; }, locationChoice, () => "unknown");
}
/** Ask (or re-ask) for location as her choice: a refusal in the browser prompt is remembered as "off", never nagged. */
export async function chooseLocation(): Promise<LocState> {
  const result = await requestLocation();
  rememberLocationChoice(result.status !== "denied");
  return result;
}

/** A fix older than this is refreshed before it's used for anything that matters. */
const FRESH_MS = LOCATION_FRESH_MS;

/** The current position, refreshed first if it's stale (for reports, trips, saving "here"). */
export async function freshLocation(): Promise<LocState> {
  if (locationUsable(state)) return state;
  return requestLocation();
}

export function setArea(area: string | null) {
  if (area !== state.area) set({ area });
}

/** Ignore GPS jitter: only move the dot for real movement or a much better fix. */
const MOVE_M = 25;
function accept(fix: { lat: number; lon: number; accuracy: number }): boolean {
  const prev = state.point;
  if (!prev) return true;
  return haversineMeters(prev, fix) >= Math.max(MOVE_M, fix.accuracy / 2) || fix.accuracy < prev.accuracy / 2;
}

/**
 * Keep the position fresh while the app is on screen; stops when hidden so it costs
 * no battery in the background. Returns a cleanup function.
 */
export function watchWhileVisible(): () => void {
  const generation = locationGeneration;
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return () => {};
  let id: number | null = null;
  const start = () => {
    if (id !== null || document.visibilityState !== "visible") return;
    id = navigator.geolocation.watchPosition(
      (p) => {
        if (generation !== locationGeneration) return;
        const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        const point = accept(fix) ? fix : { ...state.point!, accuracy: fix.accuracy };
        set({ status: "ok", point, at: p.timestamp });
        if (!locationUsable(state)) { set({ status: "unavailable", point: null, area: null }); clearCountry(); }
        else invalidateCountryForLocation(point);
      },
      (e) => { if (generation !== locationGeneration) return; set({ status: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable", point: null, at: 0, area: null }); clearCountry(); },
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
  };
  const stop = () => {
    if (id !== null) navigator.geolocation.clearWatch(id);
    id = null;
  };
  const onVis = () => (document.visibilityState === "visible" ? start() : stop());
  start();
  document.addEventListener("visibilitychange", onVis);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    stop();
  };
}

export function setLocation(point: LocState["point"], at = Date.now()) {
  set({ status: point ? "ok" : "unavailable", point, at, area: point ? state.area : null });
  if (!locationUsable(state)) { set({ status: "unavailable", point: null, area: null }); clearCountry(); }
  else invalidateCountryForLocation(point);
}

export function useLocation(auto = true): LocState & { request: () => Promise<LocState> } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  const request = useCallback(() => requestLocation(), []);
  useEffect(() => {
    if (!auto) return;
    // Ask right away (knowing where you are is the whole point), and refresh a position
    // that's gone stale — an old fix must never pass for "where you are now".
    if (state.status === "idle" || (state.status === "ok" && Date.now() - state.at > FRESH_MS)) void requestLocation();
  }, [auto]);
  return { ...snap, request };
}

/** Time-aware greeting computed on the client (local time zone). */
export function greetingFor(d: Date): { hello: string; emoji: string; late: boolean } {
  const h = d.getHours();
  if (h < 5) return { hello: "Still up", emoji: "🌙", late: true };
  if (h < 12) return { hello: "Good morning", emoji: "☀️", late: false };
  if (h < 17) return { hello: "Good afternoon", emoji: "🌤️", late: false };
  if (h < 21) return { hello: "Good evening", emoji: "🌆", late: h >= 19 };
  return { hello: "Good evening", emoji: "🌙", late: true };
}

/** One-shot destination hand-off (e.g. Mira → Home map), in memory only. */
let pendingDest: { name: string; lat: number; lon: number; kind?: string } | null = null;
export function setPendingDestination(d: typeof pendingDest) {
  pendingDest = d;
}
/** Reading during React render must be pure: Strict Mode may render a screen twice. */
export function peekPendingDestination() {
  return pendingDest;
}
export function clearPendingDestination(expected: NonNullable<typeof pendingDest>) {
  if (pendingDest === expected) pendingDest = null;
}
/** A spot picked on the map (long-press) for the Report screen. Memory only, never in URLs. */
export interface PickedSpot {
  lat: number;
  lon: number;
  name: string | null;
}
let pendingReportSpot: PickedSpot | null = null;
export function setPendingReportSpot(s: PickedSpot) {
  pendingReportSpot = s;
}
export function takePendingReportSpot(): PickedSpot | null {
  const s = pendingReportSpot;
  pendingReportSpot = null;
  return s;
}

export function takePendingDestination() {
  const d = pendingDest;
  pendingDest = null;
  return d;
}

/** Client clock that ticks every 30 s; null during SSR (avoids hydration mismatch). */
let clockNow: Date | null = null;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
// Module-level so React keeps one subscription (an inline subscribe re-subscribes every render).
function subscribeClock(l: () => void) {
  clockListeners.add(l);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clockNow = new Date();
      clockListeners.forEach((x) => x());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(l);
    if (!clockListeners.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
function clockSnapshot(): Date {
  // Refresh only when stale, so repeated reads within a render return the same object.
  if (!clockNow || Date.now() - clockNow.getTime() > 30_000) clockNow = new Date();
  return clockNow;
}

export function useClock(): Date | null {
  return useSyncExternalStore(subscribeClock, clockSnapshot, () => null);
}
