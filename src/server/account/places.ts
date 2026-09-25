import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { ApiError } from "@/server/http/errors";

export { MAX_SAVED_PLACES } from "@/domain/limits";
import { MAX_SAVED_PLACES } from "@/domain/limits";

export const savedPlaceSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    emoji: z.string().max(8).default("📍"),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    address: z.string().max(160).optional(),
  })
  .strict();

export interface SavedPlace {
  id: string;
  label: string;
  emoji: string;
  lat: number;
  lon: number;
  address: string | null;
}

export async function listPlaces(sql: postgres.Sql, userId: string): Promise<SavedPlace[]> {
  return sql<SavedPlace[]>`SELECT id, label, emoji, lat, lon, address FROM saved_places WHERE user_id = ${userId} ORDER BY created_at`;
}

/**
 * Save a place. Saving a label you already have ("Home" again) moves that place instead of
 * adding a duplicate — which also makes a double tap harmless. Count + write run under a
 * per-user lock so two tabs can't exceed the limit.
 */
export async function addPlace(sql: postgres.Sql, userId: string, p: z.infer<typeof savedPlaceSchema>): Promise<SavedPlace> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`places:${userId}`}))`;
    const [same] = await tx<SavedPlace[]>`
      UPDATE saved_places SET emoji = ${p.emoji}, lat = ${p.lat}, lon = ${p.lon}, address = ${p.address ?? null}
      WHERE id = (SELECT id FROM saved_places WHERE user_id = ${userId} AND lower(label) = lower(${p.label}) LIMIT 1)
      RETURNING id, label, emoji, lat, lon, address`;
    if (same) return same;
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_places WHERE user_id = ${userId}`;
    if (n >= MAX_SAVED_PLACES) throw new ApiError(409, "too_many_places", `You can save up to ${MAX_SAVED_PLACES} places.`);
    const [row] = await tx<SavedPlace[]>`
      INSERT INTO saved_places (user_id, label, emoji, lat, lon, address) VALUES (${userId}, ${p.label}, ${p.emoji}, ${p.lat}, ${p.lon}, ${p.address ?? null})
      RETURNING id, label, emoji, lat, lon, address`;
    return row;
  });
}

export async function removePlace(sql: postgres.Sql, userId: string, id: string): Promise<void> {
  await sql`DELETE FROM saved_places WHERE id = ${id} AND user_id = ${userId}`;
}
