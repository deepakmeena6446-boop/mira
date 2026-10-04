-- 0028_email_suppressions (forward-only). Separate statements with the drizzle breakpoint marker line.
-- Audit P20-001/P20-002: anyone could have MIRA email any address again and again (invites carrying text they chose),
-- and the person receiving them had no way to stop it. An address whose owner tapped "Stop MIRA emails" is kept here
-- as the same keyed hash contacts.email_hash uses (never the address), so it can't be invited or emailed again.
-- Kept until deleted by hand: an opt-out must outlive retention windows. Additive.
CREATE TABLE email_suppressions (
  email_hash text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
