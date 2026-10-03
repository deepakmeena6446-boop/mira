-- Separate confirmed arrival from a person's manual end. Historical closed counts
-- cannot be reconstructed as arrivals and remain explicitly ambiguous.
ALTER TABLE decision_outcomes DROP CONSTRAINT decision_outcomes_event_check;
--> statement-breakpoint
UPDATE decision_outcomes SET event = 'journey_closed_legacy' WHERE event = 'journey_completed';
--> statement-breakpoint
ALTER TABLE decision_outcomes ADD CONSTRAINT decision_outcomes_event_check CHECK (event IN (
  'plan_option_ready', 'plan_option_partial', 'plan_answer_ready', 'plan_answer_partial',
  'journey_started', 'journey_changed', 'journey_arrived', 'journey_ended', 'journey_closed_legacy'
));
