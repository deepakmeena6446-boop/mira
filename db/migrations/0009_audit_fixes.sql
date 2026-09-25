-- 0009_audit_fixes (forward-only).
-- Each trusted contact gets their own live link, so removing a contact revokes it at once
-- (the row cascades away with the contact). Hash for lookup, encrypted copy for alert emails.
ALTER TABLE trip_contacts ADD COLUMN share_token_hash text UNIQUE;
--> statement-breakpoint
ALTER TABLE trip_contacts ADD COLUMN share_token_enc text;
--> statement-breakpoint
-- Contacts who were told "missed" also get told "arrived" (once).
ALTER TABLE journeys ADD COLUMN arrived_notice_at timestamptz;
--> statement-breakpoint
-- Hot lookups and cascades on account deletion.
CREATE INDEX IF NOT EXISTS journeys_user_idx ON journeys (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trip_contacts_contact_idx ON trip_contacts (contact_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reports_private_user_idx ON reports_private (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON auth_accounts (user_id);
