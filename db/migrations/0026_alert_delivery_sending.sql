-- 0026_alert_delivery_sending (forward-only). Separate statements with the drizzle breakpoint marker line.
-- Audit P0-7: a missed-check-in alert claimed by a worker that then died was never sent. Each contact's send is now
-- taken claimed -> sending just before SMTP, so a later pass can tell "never attempted" (still claimed: safe to send)
-- from "cut off mid-send" (sending: unconfirmed, never sent twice). Additive.
ALTER TABLE trip_contacts DROP CONSTRAINT IF EXISTS trip_contacts_alert_delivery_check;
--> statement-breakpoint
ALTER TABLE trip_contacts ADD CONSTRAINT trip_contacts_alert_delivery_check CHECK (alert_delivery IN ('none', 'claimed', 'sending', 'sent', 'failed', 'unconfirmed', 'not_attempted'));
