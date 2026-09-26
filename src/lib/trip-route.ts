"use client";

/**
 * The route line of the journey in progress, kept ON THE DEVICE only (sessionStorage, this
 * tab), so the trip screen can show Help Points ahead and ask "Was the way lit?" after a
 * reload. MIRA's server never stores the planned route. Cleared when the trip is done.
 */
const PREFIX = "mira.tripRoute.";
type Line = Array<[number, number]>;

export function keepTripRoute(tripId: string, geometry: Line) {
  try {
    clearTripRoutes(tripId);
    sessionStorage.setItem(PREFIX + tripId, JSON.stringify(geometry.slice(0, 2000)));
  } catch {
    /* storage unavailable: the trip screen fetches the route again */
  }
}

export function tripRoute(tripId: string): Line | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + tripId);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) && v.length > 1 && v.every((c) => Array.isArray(c) && c.length === 2 && c.every((n) => typeof n === "number")) ? (v as Line) : null;
  } catch {
    return null;
  }
}

/** Forget stored routes (all, or all except `keep`). */
export function clearTripRoutes(keep?: string) {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX) && k !== PREFIX + keep) sessionStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}
