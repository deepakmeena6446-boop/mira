-- 0019_contact_phone (forward-only). Separate statements with the drizzle breakpoint marker line.
-- Circle contacts can be reached on WhatsApp: a phone number (encrypted, plus a keyed hash for
-- duplicates, exactly like emails). Email becomes optional: it's only for the automatic invite and
-- missed-arrival alert. Additive: existing rows keep their email and are unchanged.
ALTER TABLE contacts ALTER COLUMN encrypted_email DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE contacts ALTER COLUMN email_hash DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_enc text;
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_hash text;
--> statement-breakpoint
ALTER TABLE contacts ADD CONSTRAINT contacts_reachable CHECK (encrypted_email IS NOT NULL OR phone_enc IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_phone_key ON contacts (user_id, phone_hash) WHERE phone_hash IS NOT NULL;
