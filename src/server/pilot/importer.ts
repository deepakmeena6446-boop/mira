/**
 * Writes a validated pilot snapshot into PostGIS inside one transaction.
 * Used by `npm run pilot:import` (real sourced extract) and by integration tests
 * (test-only fixtures loaded into the separate test database).
 */
import type postgres from "postgres";
import {
  buildPlaces,
  buildWalkGraph,
  connectedComponents,
  validateImport,
  type OsmElement,
  type ValidationResult,
} from "@/domain/osm";
import { PILOT, type Bounds } from "@/domain/pilot";

export interface PilotSourceMeta {
  slug: string;
  name: string;
  bounds: Bounds;
  sourceDate: string;
  manifestHash: string;
  sourceUrl: string;
  sourceLicence: string;
  importerVersion: string;
}

const CHUNK = 2000;

function chunks<T>(arr: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function importPilot(
  sql: postgres.Sql,
  elements: OsmElement[],
  meta: PilotSourceMeta,
  opts: { minLargestComponent?: number } = {},
): Promise<ValidationResult> {
  const b = meta.bounds;
  if (
    meta.slug === PILOT.slug &&
    (b.south !== PILOT.bounds.south || b.north !== PILOT.bounds.north || b.west !== PILOT.bounds.west || b.east !== PILOT.bounds.east)
  ) {
    throw new Error("Manifest bounds do not match the fixed pilot rectangle");
  }
  const places = buildPlaces(elements, b);
  const graph = buildWalkGraph(elements, b);
  const validation = validateImport(places, graph, b, opts.minLargestComponent ?? 50);
  if (!validation.ok) return validation;
  const { componentOf } = connectedComponents(graph);

  const polygonWkt = `POLYGON((${b.west} ${b.south},${b.east} ${b.south},${b.east} ${b.north},${b.west} ${b.north},${b.west} ${b.south}))`;

  await sql.begin(async (tx) => {
    // Replacing a snapshot removes the previous pilot rows (cascade to places/graph).
    // Place ids are derived from the OSM identity so links stay stable across re-imports.
    await tx`DELETE FROM pilot_areas WHERE slug = ${meta.slug}`;
    const [pilot] = await tx<{ id: string }[]>`
      INSERT INTO pilot_areas (slug, name, polygon, source_date, manifest_hash, source_url, source_licence, importer_version, status)
      VALUES (${meta.slug}, ${meta.name}, ST_GeomFromText(${polygonWkt}, 4326), ${meta.sourceDate}, ${meta.manifestHash},
              ${meta.sourceUrl}, ${meta.sourceLicence}, ${meta.importerVersion}, 'importing')
      RETURNING id`;

    for (const part of chunks(places)) {
      await tx`
        INSERT INTO places (id, pilot_id, osm_type, osm_id, name, name_hi, place_type, point, tags, search_text, source_date)
        SELECT md5('osm:' || t.osm_type || '/' || t.osm_id::text)::uuid, ${pilot.id}::uuid, t.osm_type, t.osm_id, t.name, t.name_hi, t.place_type,
               ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326), t.tags::jsonb, t.search_text, ${meta.sourceDate}::timestamptz
        FROM unnest(
          ${part.map((p) => p.osmType)}::text[],
          ${part.map((p) => p.osmId)}::bigint[],
          ${part.map((p) => p.name)}::text[],
          ${part.map((p) => p.nameHi)}::text[],
          ${part.map((p) => p.placeType)}::text[],
          ${part.map((p) => p.point.lon)}::float8[],
          ${part.map((p) => p.point.lat)}::float8[],
          ${part.map((p) => JSON.stringify({ ...p.tags, "mira:kind": p.kindLabel }))}::text[],
          ${part.map((p) => p.searchText)}::text[]
        ) AS t(osm_type, osm_id, name, name_hi, place_type, lon, lat, tags, search_text)`;
    }

    const nodeList = [...graph.nodes.values()];
    for (const part of chunks(nodeList)) {
      await tx`
        INSERT INTO walk_nodes (pilot_id, osm_node_id, point, component)
        SELECT ${pilot.id}::uuid, t.id, ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326), t.component
        FROM unnest(
          ${part.map((n) => n.id)}::bigint[],
          ${part.map((n) => n.lon)}::float8[],
          ${part.map((n) => n.lat)}::float8[],
          ${part.map((n) => componentOf.get(n.id) ?? -1)}::int[]
        ) AS t(id, lon, lat, component)`;
    }

    for (const part of chunks(graph.edges)) {
      await tx`
        INSERT INTO walk_edges (pilot_id, from_node, to_node, geom, length_m, source_way_id, tags)
        SELECT ${pilot.id}::uuid, t.from_node, t.to_node, ST_GeomFromText(t.wkt, 4326), t.length_m, t.way_id, t.tags::jsonb
        FROM unnest(
          ${part.map((e) => e.from)}::bigint[],
          ${part.map((e) => e.to)}::bigint[],
          ${part.map((e) => `LINESTRING(${e.coords.map((c) => `${c.lon} ${c.lat}`).join(",")})`)}::text[],
          ${part.map((e) => e.lengthM)}::float8[],
          ${part.map((e) => e.wayId)}::bigint[],
          ${part.map((e) => JSON.stringify(e.tags))}::text[]
        ) AS t(from_node, to_node, wkt, length_m, way_id, tags)`;
    }

    // Database-side geometry validation before the snapshot is marked ready.
    const [check] = await tx<{ bad_places: number; bad_edges: number }[]>`
      SELECT
        (SELECT count(*)::int FROM places p WHERE p.pilot_id = ${pilot.id}
           AND (NOT ST_IsValid(p.point) OR NOT ST_Within(p.point, ST_GeomFromText(${polygonWkt}, 4326)))) AS bad_places,
        (SELECT count(*)::int FROM walk_edges e WHERE e.pilot_id = ${pilot.id}
           AND (NOT ST_IsValid(e.geom) OR NOT ST_CoveredBy(e.geom, ST_GeomFromText(${polygonWkt}, 4326)))) AS bad_edges`;
    if (check.bad_places > 0 || check.bad_edges > 0) {
      throw new Error(`PostGIS validation failed: ${check.bad_places} invalid places, ${check.bad_edges} invalid edges`);
    }

    await tx`
      UPDATE pilot_areas SET status = 'ready', place_count = ${places.length},
        node_count = ${graph.nodes.size}, edge_count = ${graph.edges.length}
      WHERE id = ${pilot.id}`;
  });

  return validation;
}
