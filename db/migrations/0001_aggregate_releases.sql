-- Public community output (architecture §3, §5). The ONLY table that may be joined into
-- public KNOW responses. Holds coarse, thresholded, template-worded summaries:
-- no counts, narratives, exact points or times. Rows expire after 35 days.
CREATE TABLE aggregate_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_week date NOT NULL,
  released_at timestamptz NOT NULL,
  cell_id text NOT NULL CHECK (cell_id ~ '^c[0-9]{1,2}-[0-9]{1,2}$'),
  time_band text NOT NULL CHECK (time_band IN ('day', 'evening', 'late')),
  category text NOT NULL,
  polarity text NOT NULL CHECK (polarity IN ('positive', 'environmental', 'incident')),
  tags text[] NOT NULL DEFAULT '{}',
  copy text NOT NULL,
  coverage text NOT NULL CHECK (coverage IN ('multiple_independent_recent_observations')),
  observation_window text NOT NULL CHECK (observation_window IN ('past_4_weeks')),
  expires_at timestamptz NOT NULL,
  suppressed_at timestamptz,
  UNIQUE (release_week, cell_id, time_band, category)
);
--> statement-breakpoint
CREATE INDEX aggregate_releases_public_idx ON aggregate_releases (cell_id, time_band) WHERE suppressed_at IS NULL;
