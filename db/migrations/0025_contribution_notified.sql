-- 0025_contribution_notified (forward-only). Separate statements with the drizzle breakpoint marker line.
-- Phase 4: tell a contributor once when what they added is confirmed by someone else. Additive.
ALTER TABLE contribution_receipts ADD COLUMN notified_at timestamptz;
--> statement-breakpoint
-- Existing confirmations are history, not news: mark them so the first run doesn't announce old ones.
UPDATE contribution_receipts SET notified_at = now() WHERE status = 'verified';
--> statement-breakpoint
CREATE INDEX contribution_receipts_unnotified_idx ON contribution_receipts (user_id) WHERE status = 'verified' AND counted AND notified_at IS NULL;
