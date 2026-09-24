/**
 * One-time, rate-respecting retrieval of the real OSM pilot extract (architecture §2).
 *
 * - One Overpass request for the fixed pilot rectangle; the response is cached in
 *   data/pilot/osm-extract.json.gz and never re-fetched unless --refresh is given.
 * - Records provenance (endpoint, query, OSM snapshot timestamp, licence, checksums)
 *   in data/pilot/manifest.json.
 * - Retries at most 3 times with long back-off on 429/5xx, honouring Retry-After.
 *
 * Data © OpenStreetMap contributors, available under the Open Database Licence (ODbL).
 */
import { createHash } from "node:crypto";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { PILOT } from "../src/domain/pilot";
import { IMPORTER_VERSION, EXTRACT_FILE, MANIFEST_FILE, type PilotManifest } from "./pilot-manifest";

const ENDPOINT = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const USER_AGENT = "MIRA-pilot-import/1 (one-time cached setup extract for a small pilot area)";

export function buildQuery(): string {
  const b = PILOT.bounds;
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return [
    `[out:json][timeout:180][bbox:${bbox}];`,
    "(",
    '  way["highway"];',
    '  node["name"];',
    '  node["amenity"];',
    '  node["shop"];',
    '  node["railway"];',
    '  node["public_transport"];',
    '  node["highway"="bus_stop"];',
    '  node["healthcare"];',
    '  node["tourism"];',
    '  way["name"][!"highway"];',
    '  way["amenity"];',
    '  way["shop"];',
    '  way["tourism"];',
    '  way["leisure"];',
    '  way["building"="dormitory"];',
    ");",
    "(._;>;);",
    "out body qt;",
  ].join("\n");
}

async function fetchWithBackoff(query: string): Promise<string> {
  const body = new URLSearchParams({ data: query }).toString();
  let delay = 30_000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
      body,
    });
    if (res.ok) return await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 3) {
      throw new Error(`Overpass request failed with HTTP ${res.status}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay;
    console.warn(`Overpass HTTP ${res.status}; waiting ${Math.round(wait / 1000)}s before retry ${attempt + 1}/3`);
    await new Promise((r) => setTimeout(r, wait));
    delay *= 2;
  }
  throw new Error("unreachable");
}

async function main() {
  mkdirSync("data/pilot", { recursive: true });
  if (existsSync(EXTRACT_FILE) && !process.argv.includes("--refresh")) {
    console.log(`${EXTRACT_FILE} already present; not re-fetching (use --refresh to replace).`);
    return;
  }
  const query = buildQuery();
  console.log(`Requesting pilot extract from ${ENDPOINT} …`);
  const text = await fetchWithBackoff(query);
  const json = JSON.parse(text) as {
    osm3s?: { timestamp_osm_base?: string; copyright?: string };
    elements?: Array<{ type: string }>;
    remark?: string;
  };
  if (json.remark && /error|timed out|runtime/i.test(json.remark)) {
    throw new Error(`Overpass returned an error remark: ${json.remark}`);
  }
  const elements = json.elements ?? [];
  if (elements.length === 0) throw new Error("Overpass returned no elements for the pilot bounds");
  const snapshot = json.osm3s?.timestamp_osm_base;
  if (!snapshot) throw new Error("Overpass response lacks osm3s.timestamp_osm_base; cannot record snapshot date");

  const raw = Buffer.from(text, "utf8");
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(EXTRACT_FILE, gz);

  const manifest: PilotManifest = {
    pilot: {
      slug: PILOT.slug,
      name: PILOT.name,
      bounds: PILOT.bounds,
      crs: "EPSG:4326",
    },
    source: {
      provider: "OpenStreetMap via Overpass API",
      url: ENDPOINT,
      query,
      snapshotTimestamp: snapshot,
      retrievedAt: new Date().toISOString(),
      licence: "ODbL-1.0",
      licenceUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      attribution: "© OpenStreetMap contributors",
      copyrightUrl: "https://www.openstreetmap.org/copyright",
      notice: json.osm3s?.copyright ?? null,
    },
    extract: {
      file: EXTRACT_FILE,
      format: "overpass-json+gzip",
      sha256Json: createHash("sha256").update(raw).digest("hex"),
      sha256File: createHash("sha256").update(gz).digest("hex"),
      bytesJson: raw.length,
      elementCounts: {
        nodes: elements.filter((e) => e.type === "node").length,
        ways: elements.filter((e) => e.type === "way").length,
      },
    },
    importerVersion: IMPORTER_VERSION,
  };
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Saved ${elements.length} elements (snapshot ${snapshot}).`);
  console.log(`Manifest written to ${MANIFEST_FILE}. Now run: npm run pilot:import`);
}

main().catch((err) => {
  console.error("Pilot fetch failed:", err instanceof Error ? err.message : err);
  console.error("The app will report map data as unavailable until a real extract is imported.");
  process.exit(1);
});
