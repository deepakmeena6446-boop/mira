-- 0010_lit_votes (forward-only).
-- "Was the way lit?" answers, stored per ~38 m street cell with nothing that links them to a
-- person, a trip, or each other: voter_hash is a keyed hash of (person, cell, week), so the
-- same person can't vote twice for a cell in a week, but two cells can't be joined into a
-- route. Only the day is kept (no time). Shown only when >= 3 distinct voters agree.
CREATE TABLE lit_votes (
  id bigserial PRIMARY KEY,
  cell text NOT NULL CHECK (cell ~ '^[0-9b-hjkmnp-z]{8}$'),
  value smallint NOT NULL CHECK (value IN (-1, 0, 1)),
  voter_hash text NOT NULL,
  day date NOT NULL DEFAULT current_date,
  UNIQUE (cell, voter_hash)
);
--> statement-breakpoint
CREATE INDEX lit_votes_cell_idx ON lit_votes (cell, day);
