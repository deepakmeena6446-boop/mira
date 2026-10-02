-- 0021_saved_plans (forward-only). User-approved plans only; sensitive intent is
-- encrypted as one payload, expires after 30 days, and cascades on account deletion.
CREATE TABLE saved_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
--> statement-breakpoint
CREATE INDEX saved_plans_user_created_idx ON saved_plans (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX saved_plans_expires_idx ON saved_plans (expires_at);
