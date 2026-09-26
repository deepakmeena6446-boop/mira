-- 0012_global_day0 (forward-only). Global Day-0 beta: time zone per journey, explicit travel
-- preferences, and journey habits learned only from completed journeys to places she saved.
-- A journey's IANA time zone, taken from her phone at start, so times in emails and on the viewer
-- page are shown in her local time (never a hardcoded IST).
ALTER TABLE journeys ADD COLUMN tz text CHECK (tz IS NULL OR char_length(tz) BETWEEN 1 AND 64);
--> statement-breakpoint
-- Preferences she set herself (preferred way of travelling, Help Point classes to prefer...).
-- Never inferred traits. Shown and editable in Me.
ALTER TABLE users ADD COLUMN travel_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
-- Whether MIRA may remember journey habits at all (she can switch it off; off deletes them).
ALTER TABLE users ADD COLUMN remember_habits boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- Journey habits: how often she completed a journey to one of HER SAVED places, by way of
-- travelling and local start hour, and who she shared it with last time. No coordinates, no
-- routes, no timestamps finer than the day. Deleted with the place, the account, or on request.
CREATE TABLE journey_habits (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES saved_places(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('walk', 'ride', 'transit', 'other')),
  start_hour smallint NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  times integer NOT NULL DEFAULT 1 CHECK (times > 0),
  last_shared_with uuid[] NOT NULL DEFAULT '{}',
  last_day date NOT NULL DEFAULT current_date,
  PRIMARY KEY (user_id, place_id, mode, start_hour)
);
--> statement-breakpoint
-- Which saved place a journey was to (only while the journey exists; journeys are purged <= 24 h after closing).
ALTER TABLE journeys ADD COLUMN saved_place_id uuid REFERENCES saved_places(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Local start hour (0-23) on her phone, for the habit counter above.
ALTER TABLE journeys ADD COLUMN start_hour smallint CHECK (start_hour IS NULL OR start_hour BETWEEN 0 AND 23);
