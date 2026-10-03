-- Coarse UTC-day product outcomes only. No actor, IP, place, route, text or contact fields.
CREATE TABLE decision_outcomes (
  day date NOT NULL,
  event text NOT NULL CHECK (event IN ('plan_option_ready', 'plan_option_partial', 'plan_answer_ready', 'plan_answer_partial', 'journey_started', 'journey_changed', 'journey_completed')),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, event)
);
