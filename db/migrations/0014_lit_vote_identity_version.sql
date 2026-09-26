-- Existing rows may include weekly hashes that cannot be linked to a person without
-- reversing the privacy design. Preserve them for audit/expiry, but do not count them as
-- independent map or receipt evidence. New stable per-stretch votes use version 2.
ALTER TABLE lit_votes ADD COLUMN identity_version smallint NOT NULL DEFAULT 1 CHECK (identity_version IN (1, 2));
--> statement-breakpoint
ALTER TABLE lit_votes ALTER COLUMN identity_version SET DEFAULT 2;
