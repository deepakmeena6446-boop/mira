-- Temporary check-in journeys (architecture §3, §6). No origin, no location track.
-- Hard-deleted at purge_at (<= 24h after closing); invites cascade.
CREATE TABLE journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_actor_hash text NOT NULL,
  idempotency_key text NOT NULL,
  place_id uuid REFERENCES places(id) ON DELETE SET NULL,
  destination_label_enc text,
  eta_at timestamptz NOT NULL,
  extended boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'missed', 'arrived', 'ended', 'expired')),
  contact_state text NOT NULL DEFAULT 'none' CHECK (contact_state IN ('none', 'invite_pending', 'invite_failed', 'accepted', 'revoked')),
  alert_state text NOT NULL DEFAULT 'none' CHECK (alert_state IN ('none', 'claimed', 'sent', 'failed', 'unconfirmed', 'not_attempted')),
  alert_claimed_at timestamptz,
  created_at timestamptz NOT NULL,
  missed_at timestamptz,
  closed_at timestamptz,
  purge_at timestamptz,
  UNIQUE (owner_actor_hash, idempotency_key),
  CHECK (eta_at <= created_at + interval '4 hours 1 minute'),
  CHECK ((state IN ('active', 'missed')) = (closed_at IS NULL)),
  CHECK (closed_at IS NULL OR (purge_at IS NOT NULL AND purge_at <= closed_at + interval '24 hours'))
);
--> statement-breakpoint
-- One open journey per browser, enforced by the database.
CREATE UNIQUE INDEX journeys_one_open_per_actor ON journeys (owner_actor_hash) WHERE state IN ('active', 'missed');
--> statement-breakpoint
CREATE INDEX journeys_due_idx ON journeys (eta_at) WHERE state IN ('active', 'missed');
--> statement-breakpoint
CREATE INDEX journeys_purge_idx ON journeys (purge_at) WHERE purge_at IS NOT NULL;
--> statement-breakpoint

CREATE TABLE contact_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL UNIQUE REFERENCES journeys(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  encrypted_email text NOT NULL,
  created_at timestamptz NOT NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL
);
