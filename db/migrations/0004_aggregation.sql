-- Private aggregation bookkeeping (architecture §5). Never joined into public output.
-- Contributions link a release to the pseudonymous actors/reports behind it so that
-- (a) a changed release needs five NEW independent contributors (anti-differencing) and
-- (b) withdrawing a report can suppress a release that falls below the threshold.
CREATE TABLE aggregate_contributions (
  release_id uuid NOT NULL REFERENCES aggregate_releases(id) ON DELETE CASCADE,
  actor_hash text NOT NULL,
  report_id uuid REFERENCES reports_private(id) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX aggregate_contributions_release_idx ON aggregate_contributions (release_id);
--> statement-breakpoint
CREATE INDEX aggregate_contributions_report_idx ON aggregate_contributions (report_id);
--> statement-breakpoint

-- One row per weekly run; makes the Monday release idempotent. Operational counts only.
CREATE TABLE aggregate_runs (
  release_week date PRIMARY KEY,
  ran_at timestamptz NOT NULL,
  keys_evaluated integer NOT NULL,
  releases_created integer NOT NULL,
  held_for_burst integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE aggregate_releases ADD COLUMN suppress_reason text;
--> statement-breakpoint
ALTER TABLE admin_audit ADD COLUMN release_id uuid;
