-- Moderator audit trail (execution plan Phase 4). Safe metadata only: which admin
-- session did what to which report id and why (a fixed reason code). Never narrative,
-- contact or location text. Purged after 90 days.
CREATE TABLE admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_session_id uuid REFERENCES admin_sessions(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('login', 'logout', 'open_text', 'approve', 'hold', 'reject', 'withdraw', 'redact', 'edit', 'suppress_release')),
  report_id uuid,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX admin_audit_created_idx ON admin_audit (created_at);
--> statement-breakpoint
ALTER TABLE reports_private ADD COLUMN redacted_at timestamptz;
--> statement-breakpoint
ALTER TABLE reports_private ADD COLUMN review_reason text;
