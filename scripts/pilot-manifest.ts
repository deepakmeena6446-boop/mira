import type { Bounds } from "../src/domain/pilot";

export const IMPORTER_VERSION = "mira-osm-import/1.0.0";
export const EXTRACT_FILE = "data/pilot/osm-extract.json.gz";
export const MANIFEST_FILE = "data/pilot/manifest.json";

export interface PilotManifest {
  pilot: { slug: string; name: string; bounds: Bounds; crs: "EPSG:4326" };
  source: {
    provider: string;
    url: string;
    query: string;
    snapshotTimestamp: string;
    retrievedAt: string;
    licence: string;
    licenceUrl: string;
    attribution: string;
    copyrightUrl: string;
    notice: string | null;
  };
  extract: {
    file: string;
    format: "overpass-json+gzip";
    sha256Json: string;
    sha256File: string;
    bytesJson: number;
    elementCounts: { nodes: number; ways: number };
  };
  importerVersion: string;
}
