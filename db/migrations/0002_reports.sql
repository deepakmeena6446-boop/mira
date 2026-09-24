-- Private report intake (architecture §3, §5). Moderator-only. No exact coordinate or
-- incident timestamp is collected: only a 500 m cell, a recency bucket and a time band.
-- Submission time is truncated to the hour. Hard-deleted at expires_at (<= 30 days).
CREATE TABLE reports_private (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_hash text NOT NULL,
  idempotency_key text NOT NULL,
  involvement text NOT NULL CHECK (involvement IN ('experienced', 'witnessed')),
  category text NOT NULL CHECK (category IN ('harassment', 'following_stalking', 'unwanted_touching', 'threatening_behaviour',
                                             'transport_issue', 'environment', 'positive_condition', 'other')),
  coarse_cell_id text NOT NULL CHECK (coarse_cell_id ~ '^c[0-9]{1,2}-[0-9]{1,2}$'),
  recency_bucket text NOT NULL CHECK (recency_bucket IN ('today', 'yesterday', 'past_week', 'earlier_unsure')),
  time_band text NOT NULL CHECK (time_band IN ('day', 'evening', 'late', 'unsure')),
  encrypted_text text,
  text_fingerprint text,
  redaction_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  hold_reasons text[] NOT NULL DEFAULT '{}',
  ai_consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'held', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  reviewed_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (actor_hash, idempotency_key),
  CHECK (expires_at <= created_at + interval '31 days')
);
--> statement-breakpoint
CREATE INDEX reports_private_status_idx ON reports_private (status, created_at);
--> statement-breakpoint
CREATE INDEX reports_private_expires_idx ON reports_private (expires_at);
--> statement-breakpoint
CREATE INDEX reports_private_burst_idx ON reports_private (coarse_cell_id, category, created_at);
--> statement-breakpoint

-- Moderator-approved structured content: the only input to aggregation. Private.
CREATE TABLE report_structured (
  report_id uuid PRIMARY KEY REFERENCES reports_private(id) ON DELETE CASCADE,
  category text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  cell_id text NOT NULL CHECK (cell_id ~ '^c[0-9]{1,2}-[0-9]{1,2}$'),
  time_band text NOT NULL CHECK (time_band IN ('day', 'evening', 'late', 'unsure')),
  recency_bucket text NOT NULL,
  approved_at timestamptz NOT NULL,
  duplicate_group text,
  withdrawn_at timestamptz
);
