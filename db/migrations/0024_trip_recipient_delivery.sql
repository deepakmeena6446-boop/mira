-- Per-journey consent and delivery receipts. No contact identities or routes are copied.
ALTER TABLE trip_contacts ADD COLUMN revoked_at timestamptz;
ALTER TABLE trip_contacts ADD COLUMN link_delivery text NOT NULL DEFAULT 'none' CHECK (link_delivery IN ('none', 'claimed', 'sent', 'failed', 'unconfirmed', 'not_attempted'));
ALTER TABLE trip_contacts ADD COLUMN alert_delivery text NOT NULL DEFAULT 'none' CHECK (alert_delivery IN ('none', 'claimed', 'sent', 'failed', 'unconfirmed', 'not_attempted'));
ALTER TABLE trip_contacts ADD COLUMN check_delivery text NOT NULL DEFAULT 'none' CHECK (check_delivery IN ('none', 'claimed', 'sent', 'failed', 'unconfirmed', 'not_attempted'));
UPDATE trip_contacts SET link_delivery = 'sent' WHERE notified_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN start_request_hash text;
--> statement-breakpoint
CREATE TABLE trip_action_receipts (
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('share', 'checkon', 'change')),
  key uuid NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (journey_id, action, key)
);
