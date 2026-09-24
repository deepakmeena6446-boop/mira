/**
 * Import the sourced pilot extract recorded in the manifest (architecture §2).
 * Verifies both checksums before touching the database; never falls back to
 * fixtures or generated data.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import postgres from "postgres";
import { loadProjectEnv } from "./load-env";
import type { PilotManifest } from "./pilot-manifest";
import { importPilot } from "../src/server/pilot/importer";
import type { OsmElement } from "../src/domain/osm";

async function main() {
  loadProjectEnv();
  const manifestPath = process.env.PILOT_MANIFEST_PATH ?? "data/pilot/manifest.json";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `npm run env:local` first.");
  if (!existsSync(manifestPath)) {
    throw new Error(`No pilot manifest at ${manifestPath}. Run \`npm run pilot:fetch\` to retrieve the sourced extract.`);
  }
  const manifestRaw = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestRaw.toString("utf8")) as PilotManifest & { testOnly?: boolean };
  if (manifest.testOnly) throw new Error("Refusing to import a test-only fixture manifest into the application database.");
  if (!existsSync(manifest.extract.file)) {
    throw new Error(`Extract ${manifest.extract.file} is missing. Run \`npm run pilot:fetch\`.`);
  }
  const gz = readFileSync(manifest.extract.file);
  const fileSha = createHash("sha256").update(gz).digest("hex");
  if (fileSha !== manifest.extract.sha256File) throw new Error("Extract file checksum does not match manifest");
  const raw = gunzipSync(gz);
  const jsonSha = createHash("sha256").update(raw).digest("hex");
  if (jsonSha !== manifest.extract.sha256Json) throw new Error("Extract JSON checksum does not match manifest");
  const parsed = JSON.parse(raw.toString("utf8")) as { elements: OsmElement[] };

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const result = await importPilot(sql, parsed.elements, {
      slug: manifest.pilot.slug,
      name: manifest.pilot.name,
      bounds: manifest.pilot.bounds,
      sourceDate: manifest.source.snapshotTimestamp,
      manifestHash: createHash("sha256").update(manifestRaw).digest("hex"),
      sourceUrl: manifest.source.url,
      sourceLicence: manifest.source.licence,
      importerVersion: manifest.importerVersion,
    });
    if (!result.ok) {
      console.error("Pilot import validation failed; database left unchanged:");
      for (const e of result.errors) console.error("  -", e);
      process.exit(1);
    }
    console.log("Pilot import complete:", result.stats);

    // Print one real place and one real connected way for provenance inspection.
    const [place] = await sql`
      SELECT name, place_type, osm_type, osm_id, ST_Y(point) AS lat, ST_X(point) AS lon
      FROM places WHERE place_type = 'metro' AND name IS NOT NULL ORDER BY name LIMIT 1`;
    const [edge] = await sql`
      SELECT e.source_way_id, e.tags->>'highway' AS highway, e.tags->>'name' AS name, round(e.length_m::numeric, 1) AS length_m
      FROM walk_edges e JOIN walk_nodes n ON n.osm_node_id = e.from_node
      WHERE n.component = 0 AND e.tags ? 'name' ORDER BY e.length_m DESC LIMIT 1`;
    console.log("Sample place:", place);
    console.log("Sample connected way:", edge);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Pilot import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
