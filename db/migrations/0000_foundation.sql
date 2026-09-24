-- MIRA foundation: pilot map data, route graph, pseudonymous sessions, operational tables.
-- Forward-only. Reviewed by the main implementer.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Public pilot metadata. One row per imported pilot snapshot; `status` = 'ready' only
-- after the importer validated bounds, ids, geometry and connectivity.
CREATE TABLE pilot_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  polygon geometry(Polygon, 4326) NOT NULL,
  source_date timestamptz NOT NULL,
  manifest_hash text NOT NULL,
  source_url text NOT NULL,
  source_licence text NOT NULL,
  importer_version text NOT NULL,
  place_count integer NOT NULL DEFAULT 0,
  node_count integer NOT NULL DEFAULT 0,
  edge_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('importing', 'ready', 'failed')),
  imported_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Public place index: only OSM-sourced, licensed fields.
CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilot_areas(id) ON DELETE CASCADE,
  osm_type text NOT NULL CHECK (osm_type IN ('node', 'way')),
  osm_id bigint NOT NULL,
  name text,
  name_hi text,
  place_type text NOT NULL,
  point geometry(Point, 4326) NOT NULL,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_text text NOT NULL DEFAULT '',
  source_date timestamptz NOT NULL,
  UNIQUE (osm_type, osm_id)
);
--> statement-breakpoint
CREATE INDEX places_point_gix ON places USING gist (point);
--> statement-breakpoint
CREATE INDEX places_search_trgm ON places USING gin (search_text gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX places_type_idx ON places (place_type);
--> statement-breakpoint

-- Public-derived walking graph. Nodes keep their OSM node id as the routing key.
CREATE TABLE walk_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilot_areas(id) ON DELETE CASCADE,
  osm_node_id bigint NOT NULL UNIQUE,
  point geometry(Point, 4326) NOT NULL,
  component integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX walk_nodes_point_gix ON walk_nodes USING gist (point);
--> statement-breakpoint
CREATE INDEX walk_nodes_component_idx ON walk_nodes (component);
--> statement-breakpoint

CREATE TABLE walk_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilot_areas(id) ON DELETE CASCADE,
  from_node bigint NOT NULL REFERENCES walk_nodes(osm_node_id) ON DELETE CASCADE,
  to_node bigint NOT NULL REFERENCES walk_nodes(osm_node_id) ON DELETE CASCADE,
  geom geometry(LineString, 4326) NOT NULL,
  length_m double precision NOT NULL CHECK (length_m > 0),
  source_way_id bigint NOT NULL,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (from_node <> to_node)
);
--> statement-breakpoint
CREATE INDEX walk_edges_from_idx ON walk_edges (from_node);
--> statement-breakpoint
CREATE INDEX walk_edges_geom_gix ON walk_edges USING gist (geom);
--> statement-breakpoint

-- Pseudonymous browser ownership. Only a keyed hash of the cookie token is stored.
CREATE TABLE actor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX actor_sessions_expires_idx ON actor_sessions (expires_at);
--> statement-breakpoint

-- Moderator sessions, separate from actor sessions. Short-lived.
CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
--> statement-breakpoint

-- Rate-limit counters keyed by a daily-rotated HMAC of IP or actor. Never raw IPs.
CREATE TABLE abuse_counters (
  key_hmac text NOT NULL,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (key_hmac, bucket, window_start)
);
--> statement-breakpoint
CREATE INDEX abuse_counters_expires_idx ON abuse_counters (expires_at);
--> statement-breakpoint

-- Worker liveness. Readiness fails when the newest heartbeat is older than 3 minutes.
CREATE TABLE worker_heartbeats (
  worker_id text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  last_beat_at timestamptz NOT NULL,
  version text NOT NULL
);
