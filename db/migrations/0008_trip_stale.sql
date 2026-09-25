-- 0008_trip_stale (forward-only).
-- When the owner was last told their live location paused (one nudge per pause; re-armed when points resume).
ALTER TABLE journeys ADD COLUMN stale_notified_at timestamptz;
