-- New place receipts can be reevaluated when later independent evidence arrives.
-- Historical rows are untouched: their deleted subject links cannot be reconstructed.
ALTER TABLE contribution_receipts ADD COLUMN claim_key text CHECK (claim_key IS NULL OR claim_key ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE contribution_receipts ADD COLUMN decision_enc text CHECK (decision_enc IS NULL OR decision_enc LIKE 'v1.%');
--> statement-breakpoint
CREATE INDEX contribution_receipts_claim_key_idx ON contribution_receipts (claim_key) WHERE claim_key IS NOT NULL;
