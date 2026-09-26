-- 0011_p1_accounts_push_modes (forward-only).
-- Durable accounts: an email login is stored as an encrypted address + keyed hash (never plaintext).
ALTER TABLE users ADD COLUMN email_hash text UNIQUE;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN email_enc text;
--> statement-breakpoint
-- Inactivity retention for durable accounts (demo accounts already go when their session ends).
ALTER TABLE users ADD COLUMN last_active_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
-- Help Point classes she has chosen not to see (e.g. police). A preference, not location data.
ALTER TABLE users ADD COLUMN help_exclude text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE auth_accounts DROP CONSTRAINT auth_accounts_provider_check;
--> statement-breakpoint
ALTER TABLE auth_accounts ADD CONSTRAINT auth_accounts_provider_check CHECK (provider IN ('google', 'demo', 'email'));
--> statement-breakpoint
-- One-time sign-in links: only a keyed hash of the token; single use; short expiry.
CREATE TABLE auth_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  email_hash text NOT NULL,
  email_enc text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
--> statement-breakpoint
CREATE INDEX auth_links_expires_idx ON auth_links (expires_at);
--> statement-breakpoint
-- Saved places encrypted at rest (label and emoji stay readable for the chips).
ALTER TABLE saved_places ADD COLUMN place_enc text;
--> statement-breakpoint
ALTER TABLE saved_places ALTER COLUMN lat DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE saved_places ALTER COLUMN lon DROP NOT NULL;
--> statement-breakpoint
-- Journeys by walk, ride (auto/cab), transit or other, with her own ETA for non-walking ones.
ALTER TABLE journeys ADD COLUMN mode text NOT NULL DEFAULT 'walk' CHECK (mode IN ('walk', 'ride', 'transit', 'other'));
--> statement-breakpoint
-- "Just share where I am" journeys have no destination to arrive at.
ALTER TABLE journeys ADD COLUMN auto_arrival boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- "Tell my people now": when she last asked her contacts to check on her (care wording, not SOS).
ALTER TABLE journeys ADD COLUMN check_requested_at timestamptz;
--> statement-breakpoint
-- Web Push to the traveller. The subscription (a capability URL + keys) is encrypted.
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_hash text NOT NULL UNIQUE,
  subscription_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz
);
--> statement-breakpoint
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
--> statement-breakpoint
-- Push outbox: an inbox item is pushed once (worker job), then marked.
ALTER TABLE notifications ADD COLUMN pushed_at timestamptz;
