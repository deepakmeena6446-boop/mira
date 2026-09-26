-- 0013_contributions (forward-only). Contribute tab: MIRA Checks, place signals and a private
-- per-person receipt ledger (docs/CONTRIBUTIONS.md). Two stores that are never joined:
--   * place_signals (like lit_votes): what was observed about a place, keyed by a keyed hash of
--     (person, place, claim group, week). No user id, no trip, no time finer than the day.
--   * contribution_receipts: "you contributed something; it is pending / verified / reports
--     differed / expired", per person, so the Contribute tab can show honest impact. The link from
--     a receipt to what it was about is ENCRYPTED and DELETED as soon as the receipt is decided.
-- Account deletion cascades to receipts and checks; signals stay, and nothing links them to anyone.
CREATE TABLE place_signals (
  id bigserial PRIMARY KEY,
  -- Provider place id as Help Points use it: Google "g:<id>", live OpenStreetMap "osm:<type>/<id>",
  -- or a local map-snapshot place (uuid).
  place_key text NOT NULL CHECK (place_key ~ '^(g:[A-Za-z0-9_-]{1,255}|osm:(node|way|relation)/[0-9]{1,20}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  claim_group text NOT NULL CHECK (claim_group IN ('open', 'staffed', 'entrance', 'exists', 'hours', 'kind')),
  claim text NOT NULL,
  -- Local weekday (0 = Monday) and time band when she was there; only for time-dependent claims.
  weekday smallint CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  band text CHECK (band IS NULL OR band IN ('day', 'evening', 'late')),
  voter_hash text NOT NULL CHECK (voter_hash ~ '^[0-9a-f]{64}$'),
  day date NOT NULL DEFAULT current_date,
  CHECK (
    (claim_group = 'open' AND claim IN ('open', 'closed')) OR
    (claim_group = 'staffed' AND claim IN ('staffed', 'unstaffed')) OR
    (claim_group = 'entrance' AND claim IN ('entrance_open', 'entrance_closed')) OR
    (claim_group = 'exists' AND claim = 'gone') OR
    (claim_group = 'hours' AND claim = 'hours_wrong') OR
    (claim_group = 'kind' AND claim = 'wrong_kind')
  ),
  CHECK ((claim_group IN ('open', 'staffed')) = (weekday IS NOT NULL AND band IS NOT NULL)),
  UNIQUE (place_key, claim_group, voter_hash)
);
--> statement-breakpoint
CREATE INDEX place_signals_place_idx ON place_signals (place_key, day);
--> statement-breakpoint
CREATE TABLE contribution_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lighting', 'place_status', 'correction')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'contradicted', 'expired')),
  verified_by text CHECK (verified_by IS NULL OR verified_by IN ('corroboration', 'provider', 'moderator')),
  -- The day only (no time), and the country (ISO 3166-1 alpha-2) when known.
  day date NOT NULL,
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  -- hmac(person, ~5 km geohash): counts distinct areas for one person; can't be compared across people.
  area_key text CHECK (area_key IS NULL OR area_key ~ '^[0-9a-f]{64}$'),
  -- hmac(person, subject): one voice per subject per window, and diminishing returns. Cleared 30 days after the decision.
  subject_hash text CHECK (subject_hash IS NULL OR subject_hash ~ '^[0-9a-f]{64}$'),
  -- Encrypted link to what the receipt is about, only while pending.
  subject_enc text CHECK (subject_enc IS NULL OR subject_enc LIKE 'v1.%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  -- Only the first verified contribution per subject per 30 days counts toward impact.
  counted boolean NOT NULL DEFAULT false,
  CHECK ((status = 'verified') = (verified_by IS NOT NULL)),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK (status = 'pending' OR subject_enc IS NULL),
  CHECK (NOT counted OR status = 'verified')
);
--> statement-breakpoint
CREATE INDEX contribution_receipts_user_idx ON contribution_receipts (user_id, created_at);
--> statement-breakpoint
CREATE INDEX contribution_receipts_pending_idx ON contribution_receipts (created_at) WHERE status = 'pending';
--> statement-breakpoint
-- MIRA Checks: at most one small question per journey, about a Help Point she actually passed.
-- While 'preparing', the last few journey points are held ENCRYPTED (same lifetime as the journey,
-- <= 24 h); once ready they're gone and only the place id/name remains. Deleted <= 24 h after creation.
CREATE TABLE mira_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id uuid UNIQUE REFERENCES journeys(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'preparing' CHECK (state IN ('preparing', 'ready', 'answered')),
  kind text NOT NULL DEFAULT 'place_open' CHECK (kind IN ('place_open')),
  subject_key text CHECK (subject_key IS NULL OR char_length(subject_key) <= 280),
  subject_name text CHECK (subject_name IS NULL OR char_length(subject_name) <= 120),
  question text CHECK (question IS NULL OR char_length(question) <= 200),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  weekday smallint CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  band text CHECK (band IS NULL OR band IN ('day', 'evening', 'late')),
  -- What the provider's listed hours said at the time she passed (null = not listed / not understood).
  provider_open boolean,
  -- ~5 km geohash of the place (for the receipt's area key), kept only while the check exists.
  area5 text CHECK (area5 IS NULL OR area5 ~ '^[0-9b-hjkmnp-z]{5}$'),
  evidence_enc text CHECK (evidence_enc IS NULL OR evidence_enc LIKE 'v1.%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  answered_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
  CHECK (state = 'preparing' OR evidence_enc IS NULL),
  CHECK (state <> 'ready' OR (subject_key IS NOT NULL AND subject_name IS NOT NULL AND question IS NOT NULL)),
  CHECK ((state = 'answered') = (answered_at IS NOT NULL)),
  CHECK (state <> 'answered' OR (subject_key IS NULL AND subject_name IS NULL AND area5 IS NULL))
);
--> statement-breakpoint
CREATE INDEX mira_checks_user_idx ON mira_checks (user_id, state);
--> statement-breakpoint
CREATE INDEX mira_checks_expiry_idx ON mira_checks (expires_at);
