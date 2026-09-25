import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { ApiError } from "@/server/http/errors";

export const MAX_SAVED_PLACES = 10;

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

export async function addPlace(sql: postgres.Sql, userId: string, p: z.infer<typeof savedPlaceSchema>): Promise<SavedPlace> {
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_places WHERE user_id = ${userId}`;
  if (n >= MAX_SAVED_PLACES) throw new ApiError(409, "too_many_places", `You can save up to ${MAX_SAVED_PLACES} places.`);
  const [row] = await sql<SavedPlace[]>`
    INSERT INTO saved_places (user_id, label, emoji, lat, lon, address) VALUES (${userId}, ${p.label}, ${p.emoji}, ${p.lat}, ${p.lon}, ${p.address ?? null})
    RETURNING id, label, emoji, lat, lon, address`;
  return row;
}

export async function removePlace(sql: postgres.Sql, userId: string, id: string): Promise<void> {
  await sql`DELETE FROM saved_places WHERE id = ${id} AND user_id = ${userId}`;
}
