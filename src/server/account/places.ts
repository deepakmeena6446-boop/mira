import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { ApiError } from "@/server/http/errors";
import { decryptText, encryptText } from "@/server/crypto";

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

/**
 * Saved places are encrypted at rest: where her home is, is the most sensitive thing MIRA
 * keeps. The point and address live in `place_enc`; only the label and emoji stay readable
 * (for the chips). Rows written before encryption are converted by `encryptLegacyPlaces`.
 */
type Row = { id: string; label: string; emoji: string; lat: number | null; lon: number | null; address: string | null; place_enc: string | null };

const seal = (p: { lat: number; lon: number; address?: string | null }) => encryptText(JSON.stringify({ lat: p.lat, lon: p.lon, address: p.address ?? null }), "saved_place");

function open(r: Row): SavedPlace {
  if (r.place_enc) {
    const v = JSON.parse(decryptText(r.place_enc, "saved_place")) as { lat: number; lon: number; address: string | null };
    return { id: r.id, label: r.label, emoji: r.emoji, lat: v.lat, lon: v.lon, address: v.address };
  }
  return { id: r.id, label: r.label, emoji: r.emoji, lat: r.lat ?? 0, lon: r.lon ?? 0, address: r.address };
}

const COLS = "id, label, emoji, lat, lon, address, place_enc";

export async function listPlaces(sql: postgres.Sql, userId: string): Promise<SavedPlace[]> {
  const rows = await sql<Row[]>`SELECT ${sql.unsafe(COLS)} FROM saved_places WHERE user_id = ${userId} ORDER BY created_at`;
  return rows.map(open);
}

/**
 * Save a place. Saving a label you already have ("Home" again) moves that place instead of
 * adding a duplicate — which also makes a double tap harmless. Count + write run under a
 * per-user lock so two tabs can't exceed the limit.
 */
export async function addPlace(sql: postgres.Sql, userId: string, p: z.infer<typeof savedPlaceSchema>): Promise<SavedPlace> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`places:${userId}`}))`;
    const [same] = await tx<Row[]>`
      UPDATE saved_places SET emoji = ${p.emoji}, lat = NULL, lon = NULL, address = NULL, place_enc = ${seal(p)}
      WHERE id = (SELECT id FROM saved_places WHERE user_id = ${userId} AND lower(label) = lower(${p.label}) LIMIT 1)
      RETURNING ${tx.unsafe(COLS)}`;
    if (same) return open(same);
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_places WHERE user_id = ${userId}`;
    if (n >= MAX_SAVED_PLACES) throw new ApiError(409, "too_many_places", `You can save up to ${MAX_SAVED_PLACES} places.`);
    const [row] = await tx<Row[]>`
      INSERT INTO saved_places (user_id, label, emoji, place_enc) VALUES (${userId}, ${p.label}, ${p.emoji}, ${seal(p)})
      RETURNING ${tx.unsafe(COLS)}`;
    return open(row);
  });
}

export async function removePlace(sql: postgres.Sql, userId: string, id: string): Promise<void> {
  await sql`DELETE FROM saved_places WHERE id = ${id} AND user_id = ${userId}`;
}

/** Worker: encrypt places saved before encryption existed, and clear their plaintext columns. */
export async function encryptLegacyPlaces(sql: postgres.Sql, limit = 500): Promise<number> {
  const rows = await sql<Row[]>`SELECT ${sql.unsafe(COLS)} FROM saved_places WHERE place_enc IS NULL AND lat IS NOT NULL LIMIT ${limit}`;
  for (const r of rows) {
    await sql`UPDATE saved_places SET place_enc = ${seal({ lat: r.lat!, lon: r.lon!, address: r.address })}, lat = NULL, lon = NULL, address = NULL WHERE id = ${r.id} AND place_enc IS NULL`;
  }
  return rows.length;
}
