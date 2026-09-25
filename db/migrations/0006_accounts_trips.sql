-- MIRA 2.0: accounts, profile (saved places, trusted contacts), live trip sharing,
-- Mira companion history, in-app inbox, and worldwide geohash cells for reports.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  onboarded_at timestamptz
);
--> statement-breakpoint
CREATE TABLE auth_accounts (
  provider text NOT NULL CHECK (provider IN ('google', 'demo')),
  provider_user_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_user_id)
);
--> statement-breakpoint
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
--> statement-breakpoint
CREATE TABLE saved_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  emoji text NOT NULL DEFAULT '📍',
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX saved_places_user_idx ON saved_places (user_id);
--> statement-breakpoint
-- Trusted contacts: accept once, reused across trips. Email is encrypted.
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  encrypted_email text NOT NULL,
  email_hash text NOT NULL,
  is_default boolean NOT NULL DEFAULT true,
  invite_token_hash text UNIQUE,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_hash)
);
--> statement-breakpoint
-- Trips reuse the journey state machine; new columns for accounts + live sharing.
ALTER TABLE journeys ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN dest_lat double precision;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN dest_lon double precision;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN dest_name text;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN route_meters integer;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN share_token_hash text UNIQUE;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN last_location_at timestamptz;
--> statement-breakpoint
-- Live points during a trip only: last few kept, hard-deleted with the trip.
CREATE TABLE trip_locations (
  id bigserial PRIMARY KEY,
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  accuracy_m real,
  at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX trip_locations_journey_idx ON trip_locations (journey_id, at DESC);
--> statement-breakpoint
-- Which contacts received this trip (for missed-arrival alerts).
CREATE TABLE trip_contacts (
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  notified_at timestamptz,
  PRIMARY KEY (journey_id, contact_id)
);
--> statement-breakpoint
CREATE TABLE mira_messages (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX mira_messages_user_idx ON mira_messages (user_id, id);
--> statement-breakpoint
-- In-app inbox (placeholder for push notifications).
CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
--> statement-breakpoint
-- Worldwide cells: geohash (precision 6, ~1.2 km) replaces the pilot grid.
ALTER TABLE reports_private DROP CONSTRAINT reports_private_coarse_cell_id_check;
--> statement-breakpoint
ALTER TABLE reports_private ADD CONSTRAINT reports_private_cell_check CHECK (coarse_cell_id ~ '^([0-9b-hjkmnp-z]{6}|c[0-9]{1,2}-[0-9]{1,2})$');
--> statement-breakpoint
ALTER TABLE reports_private ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE report_structured DROP CONSTRAINT report_structured_cell_id_check;
--> statement-breakpoint
ALTER TABLE report_structured ADD CONSTRAINT report_structured_cell_check CHECK (cell_id ~ '^([0-9b-hjkmnp-z]{6}|c[0-9]{1,2}-[0-9]{1,2})$');
--> statement-breakpoint
ALTER TABLE aggregate_releases DROP CONSTRAINT aggregate_releases_cell_id_check;
--> statement-breakpoint
ALTER TABLE aggregate_releases ADD CONSTRAINT aggregate_releases_cell_check CHECK (cell_id ~ '^([0-9b-hjkmnp-z]{6}|c[0-9]{1,2}-[0-9]{1,2})$');
--> statement-breakpoint
-- Place ids from providers are strings now; keep the legacy FK column but allow nulls.
ALTER TABLE journeys ALTER COLUMN idempotency_key DROP NOT NULL;
