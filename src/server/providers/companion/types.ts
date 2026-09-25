/** Streamed events from Mira to the chat UI (NDJSON over /api/mira). */
export type MiraCard =
  | { type: "trip"; destination: { name: string; lat: number; lon: number }; minutes: number | null; contacts: string[] }
  | { type: "places"; title: string; places: Array<{ name: string; kind: string; distanceM?: number; lat: number; lon: number }> }
  | { type: "report"; category: string; label: string }
  | { type: "sos"; contacts: string[] }
  | { type: "trip_status"; destination: string; etaAt: string; state: string }
  | { type: "save_place" };

export type MiraEvent = { type: "text"; delta: string } | { type: "card"; card: MiraCard } | { type: "done" };

export interface MiraContext {
  localTime: string; // ISO string from the device
  tzOffsetMin: number;
  location: { lat: number; lon: number } | null;
  area?: string | null;
}

export interface MiraTurn {
  role: "user" | "assistant";
  text: string;
}
