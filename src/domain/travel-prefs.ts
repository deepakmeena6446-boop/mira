import { z } from "zod";

/**
 * Travel preferences she set herself, stored in users.travel_prefs (jsonb). Explicit only:
 * MIRA never writes a preference she didn't choose. Help Point classes she'd rather not be
 * pointed to already live in users.help_exclude (Me → Help Points) and are not duplicated here.
 */
export const TRAVEL_MODES = ["walk", "ride", "transit"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** Every journey mode, including "other" (a journey mode, never a preference). */
export type JourneyModeName = TravelMode | "other";

export const travelPrefsSchema = z
  .object({
    /** Preferred way of travelling, preselected when she plans a journey. */
    mode: z.enum(TRAVEL_MODES).optional(),
    /** Share new journeys with her default circle unless she turns it off for that journey. */
    shareByDefault: z.boolean().optional(),
  })
  .strict();
export type TravelPrefs = z.infer<typeof travelPrefsSchema>;

/** PATCH /api/me/prefs: null clears a preference; rememberHabits=false also forgets every habit. */
export const travelPrefsPatchSchema = z
  .object({
    mode: z.enum(TRAVEL_MODES).nullable().optional(),
    shareByDefault: z.boolean().nullable().optional(),
    rememberHabits: z.boolean().optional(),
  })
  .strict();
export type TravelPrefsPatch = z.infer<typeof travelPrefsPatchSchema>;

/** Read what's stored, tolerating older or unknown keys (they are dropped, never trusted). */
export function parseTravelPrefs(raw: unknown): TravelPrefs {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: TravelPrefs = {};
  if (typeof src.mode === "string" && (TRAVEL_MODES as readonly string[]).includes(src.mode)) out.mode = src.mode as TravelMode;
  if (typeof src.shareByDefault === "boolean") out.shareByDefault = src.shareByDefault;
  return out;
}

/** Apply a patch to stored prefs (null removes the key). */
export function applyPrefsPatch(current: TravelPrefs, patch: TravelPrefsPatch): TravelPrefs {
  const next: TravelPrefs = { ...current };
  if (patch.mode === null) delete next.mode;
  else if (patch.mode !== undefined) next.mode = patch.mode;
  if (patch.shareByDefault === null) delete next.shareByDefault;
  else if (patch.shareByDefault !== undefined) next.shareByDefault = patch.shareByDefault;
  return travelPrefsSchema.parse(next);
}

/**
 * How a way of travelling is said in words, worldwide (no "auto", "cab" or "metro": those are
 * local words). `label` matches the mode picker (src/domain/travel-mode.ts TRAVEL_MODE_INFO on
 * the integration branch — the lead may point this at it); `short` is for lists ("walking"),
 * `phrase` completes "is on the way …".
 */
export const MODE_WORDS: Record<JourneyModeName, { label: string; short: string; phrase: string }> = {
  walk: { label: "Walk", short: "walking", phrase: "walking" },
  ride: { label: "Ride / car", short: "by car or taxi", phrase: "by car or taxi" },
  transit: { label: "Transit", short: "by transit", phrase: "by transit" },
  other: { label: "Other", short: "another way", phrase: "" },
};

export function modeWords(mode: string | null | undefined) {
  return MODE_WORDS[(mode ?? "other") as JourneyModeName] ?? MODE_WORDS.other;
}

/** "walk" → "walk", "ride"/"transit" → "ride"/"trip": the noun for the journey in copy. */
export function journeyNoun(mode: string | null | undefined): "walk" | "ride" | "trip" {
  return mode === "walk" ? "walk" : mode === "ride" ? "ride" : "trip";
}
