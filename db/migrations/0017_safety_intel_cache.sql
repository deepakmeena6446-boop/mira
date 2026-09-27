-- 0017_safety_intel_cache (forward-only). Separate statements with the drizzle breakpoint marker line.
-- Women Safety Intelligence cache: area results (key "area:<sha256>") and per-article relevance
-- decisions (key "cls:<sha256>"). Keys are hashes; rows hold no user id and no coordinates.
CREATE TABLE safety_intel_cache (
  cache_key text PRIMARY KEY CHECK (cache_key ~ '^(area|cls):[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX safety_intel_cache_expires_idx ON safety_intel_cache (expires_at);
