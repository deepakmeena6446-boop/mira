-- Preserve old place/correction receipts for audit, but remove claims that cannot be
-- recomputed from current impact and Steward. New receipts always have a claim_key.
ALTER TABLE contribution_receipts
  ADD COLUMN legacy_unverifiable boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE contribution_receipts
SET legacy_unverifiable = true
WHERE kind IN ('place_status', 'correction') AND claim_key IS NULL;
--> statement-breakpoint
CREATE INDEX contribution_receipts_legacy_unverifiable_idx
  ON contribution_receipts (user_id) WHERE legacy_unverifiable;
