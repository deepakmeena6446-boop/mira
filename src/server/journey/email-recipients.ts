/**
 * SQL condition (aliases `tc` = trip_contacts, `c` = contacts): MIRA emails this contact on this journey.
 *
 * Fixed by her choices on the journey, not re-read from the Circle (audit P02-007): a WhatsApp contact she picked
 * when the email invite was still pending (link_delivery 'not_attempted') stays a WhatsApp contact for the whole
 * journey even if they accept the invite mid-trip — the screen doesn't claim an email failed that was never tried,
 * and the missed-check-in alert doesn't silently start going to someone she was told wouldn't be emailed. Her own
 * later tap ("Tell my people now" emailing them) is a new choice and counts. Still needs an accepted address now:
 * an address that asked MIRA to stop emailing it has none.
 */
export const EMAILED_ON_TRIP = `(c.accepted_at IS NOT NULL AND c.encrypted_email IS NOT NULL
  AND (tc.link_delivery NOT IN ('none', 'not_attempted') OR tc.check_delivery NOT IN ('none', 'not_attempted')))`;
