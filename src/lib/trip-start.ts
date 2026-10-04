import { api } from "@/lib/api-client";

/**
 * Extra fields for POST /api/trips, read from THIS phone at the moment she starts: its IANA
 * time zone (so her contacts' emails and the live link show her local time, labelled) and the
 * local start hour. `savedPlaceId` only when the destination is one of her saved places — that
 * is the only case MIRA may learn a habit from, and only on arrival.
 *
 *   await api("/api/trips", { body: { from, to, share, ...tripStartExtras(place?.id) } })
 */
export function tripStartExtras(savedPlaceId?: string | null, now: Date = new Date()): { tz?: string; startHour: number; savedPlaceId?: string } {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    tz = undefined; // the server then shows times in UTC, labelled
  }
  return { ...(tz ? { tz } : {}), startHour: now.getHours(), ...(savedPlaceId ? { savedPlaceId } : {}) };
}

/** Query string for GET /api/me/habits/suggestion: her local hour now (the server never guesses it). */
export function suggestionQuery(mode?: string, now: Date = new Date()): string {
  const q = new URLSearchParams({ hour: String(now.getHours()) });
  if (mode) q.set("mode", mode);
  return `?${q.toString()}`;
}

/**
 * A start refused with `trip_active`: another journey is already open. Say so plainly and never open
 * that other journey in place of this one — it may go somewhere else and be shared with different people.
 */
export async function activeTripMessage(): Promise<string> {
  const current = await api<{ trip: { destination: { name: string }; autoArrival: boolean } | null }>("/api/trips/current");
  const where = current.ok && current.data.trip?.autoArrival && current.data.trip.destination.name ? ` to ${current.data.trip.destination.name}` : "";
  return `You already have a journey running${where}. Nothing new started, and nobody was told about this one. Open it to tap “I’m here” or end it, then start again.`;
}
