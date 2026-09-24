import "server-only";
import type postgres from "postgres";
import { displayName } from "@/domain/know-copy";
import type { PlaceSummaryPublic } from "@/domain/know-types";

interface PlaceRow {
  id: string;
  name: string | null;
  place_type: string;
  tags: Record<string, string>;
  lat: number;
  lon: number;
}

export function toPublicPlace(r: PlaceRow): PlaceSummaryPublic & { tags: Record<string, string> } {
  const kind = r.tags["mira:kind"] ?? r.place_type;
  const { ["mira:kind"]: _omit, ...tags } = r.tags;
  void _omit;
  return { id: r.id, name: displayName(r.name, kind), kind, placeType: r.place_type, point: { lat: r.lat, lon: r.lon }, tags };
}

const TYPE_RANK = `CASE place_type WHEN 'metro' THEN 0 WHEN 'education' THEN 1 WHEN 'accommodation' THEN 2 WHEN 'bus' THEN 3
  WHEN 'pharmacy' THEN 3 WHEN 'health' THEN 3 WHEN 'police' THEN 3 WHEN 'library' THEN 4 WHEN 'park' THEN 5 ELSE 6 END`;

/** Local, indexed search over the pilot place index (no third-party geocoding). */
export async function searchPlaces(sql: postgres.Sql, q: string, limit = 12): Promise<PlaceSummaryPublic[]> {
  const term = q.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const prefix = `${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await sql<PlaceRow[]>`
    SELECT id, name, place_type, tags, ST_Y(point) AS lat, ST_X(point) AS lon
    FROM places
    WHERE search_text ILIKE ${like} OR search_text % ${term}
    ORDER BY (search_text ILIKE ${prefix}) DESC,
             (name IS NOT NULL) DESC,
             ${sql.unsafe(TYPE_RANK)},
             similarity(search_text, ${term}) DESC,
             name NULLS LAST
    LIMIT ${limit}`;
  return rows.map((r) => {
    const { tags: _t, ...pub } = toPublicPlace(r);
    void _t;
    return pub;
  });
}

export async function getPlace(sql: postgres.Sql, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await sql<PlaceRow[]>`
    SELECT id, name, place_type, tags, ST_Y(point) AS lat, ST_X(point) AS lon FROM places WHERE id = ${id}`;
  return row ? toPublicPlace(row) : null;
}

/** Counts of mapped places by type within `radiusM` of a point or line (WKT, WGS84). */
export async function countNearby(sql: postgres.Sql, wkt: string, radiusM: number, excludeId?: string): Promise<Record<string, number>> {
  const rows = await sql<{ place_type: string; n: number }[]>`
    SELECT place_type, count(*)::int AS n FROM places
    WHERE ST_DWithin(point::geography, ST_GeomFromText(${wkt}, 4326)::geography, ${radiusM})
      AND (${excludeId ?? null}::uuid IS NULL OR id <> ${excludeId ?? null}::uuid)
    GROUP BY place_type`;
  return Object.fromEntries(rows.map((r) => [r.place_type, r.n]));
}
