-- 0018_retention_purge_indexes (forward-only). Separate statements with the drizzle breakpoint marker line.
-- The worker's retention pass runs every 5 minutes and filters these tables by age. Without these
-- indexes each pass scans the whole table; harmless in a small beta, not as the tables grow.
-- Additive only: nothing is dropped or rewritten (IF NOT EXISTS keeps a re-run harmless).
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions (expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lit_votes_day_idx ON lit_votes (day);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mira_messages_created_idx ON mira_messages (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS users_inactive_durable_idx ON users (last_active_at) WHERE email_hash IS NOT NULL;
