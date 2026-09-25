"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * The user's current position, held in JS memory only (never persisted, never put in
 * URLs). Shared across screens so the app "just knows" where you are.
 */
export type LocStatus = "idle" | "asking" | "ok" | "denied" | "unavailable";
export interface LocState {
  status: LocStatus;
  point: { lat: number; lon: number; accuracy: number } | null;
  at: number;
}

let state: LocState = { status: "idle", point: null, at: 0 };
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
    if (!auto || state.status !== "idle") return;
    // Ask right away: knowing where you are is the whole point of the app.
    void requestLocation();
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
