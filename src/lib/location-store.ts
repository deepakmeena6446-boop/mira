"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { haversineMeters } from "@/domain/pilot";

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

let state: LocState = { status: "idle", point: null, at: 0, area: null };
const listeners = new Set<() => void>();
const set = (s: Partial<LocState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

export function requestLocation(): Promise<LocState> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      set({ status: "unavailable" });
      return resolve(state);
    }
    if (state.status !== "ok") set({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set({ status: "ok", point: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }, at: Date.now() });
        resolve(state);
      },
      (e) => {
        set({ status: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable" });
        resolve(state);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

/** A declined first-open location choice is respected on later visits. */
export function rememberLocationChoice(useLocation: boolean) {
  try { localStorage.setItem("mira.location.skip", useLocation ? "0" : "1"); } catch { /* memory-only location still works */ }
}
export function shouldAutoLocate(): boolean {
  try { return localStorage.getItem("mira.welcomed") === "1" && localStorage.getItem("mira.location.skip") !== "1"; } catch { return false; }
}

/** A fix older than this is refreshed before it's used for anything that matters. */
const FRESH_MS = 2 * 60_000;

/** The current position, refreshed first if it's stale (for reports, trips, saving "here"). */
export async function freshLocation(): Promise<LocState> {
  if (state.status === "ok" && state.point && Date.now() - state.at <= FRESH_MS) return state;
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
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return () => {};
  let id: number | null = null;
  const start = () => {
    if (id !== null || document.visibilityState !== "visible") return;
    id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        if (accept(fix)) set({ status: "ok", point: fix, at: Date.now() });
      },
      (e) => e.code === e.PERMISSION_DENIED && set({ status: "denied" }),
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

export function setLocation(point: LocState["point"]) {
  set({ status: point ? "ok" : state.status, point, at: Date.now() });
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
