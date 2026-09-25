-- Encrypted copy of the trip share token so the owner can re-share the same live link.
ALTER TABLE journeys ADD COLUMN share_token_enc text;
--> statement-breakpoint
ALTER TABLE journeys ADD COLUMN near_dest_since timestamptz;
