-- 0020_habit_consent (forward-only). Pause legacy habit learning and suggestions
-- until the account owner makes an affirmative choice. Preserve the old setting
-- and bounded habit rows for review/deletion; do not silently treat the old
-- default as consent. New accounts start with learning off.
ALTER TABLE users ADD COLUMN legacy_remember_habits boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN habit_choice_reviewed_at timestamptz;
--> statement-breakpoint
UPDATE users SET legacy_remember_habits = remember_habits, remember_habits = false;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN remember_habits SET DEFAULT false;
