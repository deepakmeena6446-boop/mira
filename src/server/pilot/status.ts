import type postgres from "postgres";

export interface PilotStatus {
  available: boolean;
  slug: string | null;
  name: string | null;
  sourceDate: string | null;
  sourceLicence: string | null;
  placeCount: number;
  edgeCount: number;
}

export async function pilotStatus(sql: postgres.Sql): Promise<PilotStatus> {
  const [row] = await sql<
    { slug: string; name: string; source_date: Date; source_licence: string; place_count: number; edge_count: number }[]
  >`SELECT slug, name, source_date, source_licence, place_count, edge_count
    FROM pilot_areas WHERE status = 'ready' ORDER BY imported_at DESC LIMIT 1`;
  if (!row) {
    return { available: false, slug: null, name: null, sourceDate: null, sourceLicence: null, placeCount: 0, edgeCount: 0 };
  }
  return {
    available: row.place_count > 0 && row.edge_count > 0,
    slug: row.slug,
    name: row.name,
    sourceDate: new Date(row.source_date).toISOString(),
    sourceLicence: row.source_licence,
    placeCount: row.place_count,
    edgeCount: row.edge_count,
  };
}
