import type postgres from "postgres";
import { importPilot } from "@/server/pilot/importer";
import { PILOT } from "@/domain/pilot";
import { buildGridFixture } from "../fixtures/osm-grid";

/** Load the TEST-ONLY synthetic grid into the test database. */
export async function loadFixturePilot(sql: postgres.Sql): Promise<void> {
  const [row] = await sql`SELECT 1 FROM pilot_areas WHERE slug = 'test-fixture' AND status = 'ready'`;
  if (row) return;
  const res = await importPilot(
    sql,
    buildGridFixture(),
    { slug: "test-fixture", name: "Test fixture grid", bounds: PILOT.bounds, sourceDate: "2026-01-01T00:00:00Z", manifestHash: "test-only", sourceUrl: "test-fixture", sourceLicence: "ODbL-1.0", importerVersion: "test" },
    { minLargestComponent: 10 },
  );
  if (!res.ok) throw new Error("fixture import failed");
}

export async function fixturePlaceId(sql: postgres.Sql, name: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM places WHERE name = ${name}`;
  return row.id;
}
