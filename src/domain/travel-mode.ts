/**
 * How she is travelling, and what MIRA can honestly say for each mode (intelligence doc Part C).
 * Client-safe: types, labels and pure helpers only.
 *
 * Labels are global: "Ride / car" covers taxis, ride-hail, tuk-tuks and being driven; "Transit"
 * covers metro, train, bus, tram and ferry. Never "Auto" or "Metro" (those are one country's words).
 *
 * Context per mode:
 *  - walk: route options, lighting along the way, Help Points along the way.
 *  - ride / transit: the provider's time and line when it has one, Help Points near where she
 *    arrives (the last walk). No lighting: street lighting is about walking, and MIRA says so.
 *  The journeys table also allows "other" (e.g. just sharing where she is); it is not picked here.
 */

export type TravelMode = "walk" | "ride" | "transit";
export const TRAVEL_MODES = ["walk", "ride", "transit"] as const satisfies readonly TravelMode[];

export interface TravelModeInfo {
  /** Selector label. */
  label: string;
  /** After a duration: "18 min walk", "22 min by car", "35 min by transit". */
  by: string;
  /** Lighting along the way (walking only). */
  lighting: boolean;
  /** Route alternatives and Help Points along the whole way (walking only). */
  helpAlong: boolean;
  /** Help Points near the destination, for the last walk. */
  helpAtArrival: boolean;
}

export const TRAVEL_MODE_INFO: Record<TravelMode, TravelModeInfo> = {
  walk: { label: "Walk", by: "walk", lighting: true, helpAlong: true, helpAtArrival: false },
  ride: { label: "Ride / car", by: "by car", lighting: false, helpAlong: false, helpAtArrival: true },
  transit: { label: "Transit", by: "by transit", lighting: false, helpAlong: false, helpAtArrival: true },
};

export function isTravelMode(v: unknown): v is TravelMode {
  return typeof v === "string" && (TRAVEL_MODES as readonly string[]).includes(v);
}

/** "18 min walk" / "22 min by car" / "1 h 35 min by transit". */
export function travelLine(mode: TravelMode, minutes: number): string {
  return `${formatMinutes(minutes)} ${TRAVEL_MODE_INFO[mode].by}`;
}

/** "45 min", "1 h", "1 h 30" (hours for anything an hour or longer). */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

/** The ETA a started journey accepts (mirrors startTripSchema.etaMinutes in src/server/trips). */
export const TRIP_ETA_MIN = 5;
export const TRIP_ETA_MAX = 235;

/**
 * The time MIRA should expect her, from a provider's ride or transit estimate: a little extra
 * for traffic, waiting and the last few steps (×1.2 + 5 min), rounded up to 5 minutes, within
 * what a journey accepts. Her people are only told she's late after this, never at the raw estimate.
 */
export function expectedMinutes(providerMinutes: number): number {
  const buffered = Math.ceil((Math.max(1, providerMinutes) * 1.2 + 5) / 5) * 5;
  return Math.min(TRIP_ETA_MAX, Math.max(TRIP_ETA_MIN, buffered));
}

// ── Distances ──────────────────────────────────────────────────────────────────────

export type DistanceUnits = "metric" | "imperial";

/** Countries where road distances are in miles (ISO 3166-1 alpha-2). */
const MILES = new Set(["US", "GB", "LR", "MM"]);

export function distanceUnits(iso: string | null | undefined): DistanceUnits {
  return iso && MILES.has(iso.toUpperCase()) ? "imperial" : "metric";
}

/** "350 m", "1.6 km"; in miles countries "400 ft", "1.0 mi". */
export function formatDistance(m: number, units: DistanceUnits = "metric"): string {
  const meters = Math.max(0, m);
  if (units === "imperial") {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round((meters * 3.28084) / 10) * 10} ft`;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${meters < 10_000 ? (meters / 1000).toFixed(1) : Math.round(meters / 1000)} km`;
}
