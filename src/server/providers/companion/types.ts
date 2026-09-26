/** How she'd travel. Walking gets a route and an ETA here; ride / transit are planned on Home. */
export type MiraTripMode = "walk" | "ride" | "transit";

/** A Help Point as a card shows it: class, an estimated walk, the hours as the source lists them, and the source. */
export type MiraHelpPoint = {
  name: string;
  /** Help Point class label, e.g. "Hospital", "Pharmacy". */
  label: string;
  emoji: string;
  /** Estimated walk from where she is (straight line × detour). */
  minutes: number;
  /** "Open 24h", "Open until 21:00 (listed)", "Hours not known"… (domain/help-points hoursLine). */
  hours: string;
  /** "Google Maps" / "OpenStreetMap". */
  source: string;
  lat: number;
  lon: number;
};

/** Streamed events from Mira to the chat UI (NDJSON over /api/mira). */
export type MiraCard =
  | { type: "trip"; destination: { name: string; lat: number; lon: number }; minutes: number | null; contacts: string[]; mode?: MiraTripMode }
  | { type: "places"; title: string; places: Array<{ name: string; kind: string; distanceM?: number; lat: number; lon: number }> }
  | { type: "help_points"; title: string; points: MiraHelpPoint[] }
  | { type: "report"; category: string; label: string }
  | { type: "sos"; contacts: string[] }
  | { type: "trip_status"; destination: string; etaAt: string; state: string }
  | { type: "save_place" };

/**
 * `private` text is shown live but never stored in chat history: it's derived from where
 * the person is right now ("Looks like you're near…", "a 12-minute walk"), and history
 * must not become a location log.
 */
export type MiraEvent =
  | { type: "text"; delta: string; private?: boolean }
  | { type: "card"; card: MiraCard }
  /** Server-only: the version of the reply to save in history (location details scrubbed). Never sent to the client. */
  | { type: "history"; text: string }
  /** Server-only: tokens one model call used (for the daily token guard). Never sent to the client. */
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done" };

export interface MiraContext {
  localTime: string; // ISO string from the device
  tzOffsetMin: number;
  /** IANA time zone from the device (e.g. "Europe/London"), when it has one. */
  tz?: string | null;
  location: { lat: number; lon: number } | null;
  area?: string | null;
}

export interface MiraTurn {
  role: "user" | "assistant";
  text: string;
}
