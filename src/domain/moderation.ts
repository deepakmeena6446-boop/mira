/**
 * Moderation rules (execution plan Phase 4, UX spec §7). Decisions concern
 * publication, privacy and abuse — never whether a reporter is truthful.
 * Approval permits aggregation only; it never publishes a report.
 */
import { CATEGORIES, REPORT_TIME_BANDS, TAGS_BY_CATEGORY, type Category, type ReportTimeBand } from "./report/taxonomy";

export type ReportStatus = "pending" | "held" | "approved" | "rejected";
export type ModerationAction = "approve" | "hold" | "reject" | "withdraw" | "redact" | "edit";

export const HOLD_REASONS = ["needs_redaction", "possible_burst", "possible_duplicate", "unclear", "other"] as const;
export const REJECT_REASONS = ["identifying_content", "outside_pilot", "abusive_or_spam", "duplicate", "not_an_observation", "other"] as const;
export const WITHDRAW_REASONS = ["privacy_risk", "reporter_request", "moderation_error", "other"] as const;

export const REASON_LABEL: Record<string, string> = {
  needs_redaction: "Needs redaction",
  possible_burst: "Possible coordinated burst",
  possible_duplicate: "Possible duplicate",
  unclear: "Unclear — needs another look",
  identifying_content: "Identifying content",
  outside_pilot: "Outside pilot area",
  abusive_or_spam: "Abusive or spam",
  duplicate: "Duplicate",
  not_an_observation: "Not an observation",
  privacy_risk: "Privacy risk",
  reporter_request: "Reporter request",
  moderation_error: "Moderation error",
  other: "Other",
};

export interface StructuredFields {
  category: Category;
  tags: string[];
  timeBand: ReportTimeBand;
}

export interface ModerationState {
  status: ReportStatus;
  unresolvedPii: boolean;
  withdrawn: boolean;
}

export type Decision =
  | { ok: true; next: ReportStatus; changed: boolean }
  | { ok: false; code: "invalid_transition" | "pii_unresolved" | "invalid_structured" | "reason_required"; message: string };

export function validateStructured(s: StructuredFields): string | null {
  if (!CATEGORIES.includes(s.category)) return "Unknown category.";
  if (!REPORT_TIME_BANDS.includes(s.timeBand)) return "Unknown time band.";
  if (new Set(s.tags).size !== s.tags.length) return "Duplicate tags.";
  for (const t of s.tags) if (!TAGS_BY_CATEGORY[s.category].includes(t)) return `Tag "${t}" is not allowed for this category.`;
  return null;
}

export function decide(
  state: ModerationState,
  action: ModerationAction,
  opts: { reason?: string; structured?: StructuredFields } = {},
): Decision {
  const bad = (message: string): Decision => ({ ok: false, code: "invalid_transition", message });
  switch (action) {
    case "approve": {
      if (state.status === "approved") return { ok: true, next: "approved", changed: false };
      if (state.status === "rejected") return bad("A rejected report can't be approved.");
      if (state.unresolvedPii) return { ok: false, code: "pii_unresolved", message: "Redact the detected identifying content before approving." };
      if (!opts.structured) return { ok: false, code: "invalid_structured", message: "Structured fields are required to approve." };
      const err = validateStructured(opts.structured);
      if (err) return { ok: false, code: "invalid_structured", message: err };
      return { ok: true, next: "approved", changed: true };
    }
    case "hold": {
      if (!opts.reason || !(HOLD_REASONS as readonly string[]).includes(opts.reason)) return { ok: false, code: "reason_required", message: "Choose a reason for holding." };
      if (state.status === "held") return { ok: true, next: "held", changed: false };
      if (state.status !== "pending") return bad("Only pending reports can be held.");
      return { ok: true, next: "held", changed: true };
    }
    case "reject": {
      if (!opts.reason || !(REJECT_REASONS as readonly string[]).includes(opts.reason)) return { ok: false, code: "reason_required", message: "Choose a reason for rejecting." };
      if (state.status === "rejected") return { ok: true, next: "rejected", changed: false };
      if (state.status === "approved") return bad("Withdraw an approved report from aggregation instead of rejecting it.");
      return { ok: true, next: "rejected", changed: true };
    }
    case "withdraw": {
      if (!opts.reason || !(WITHDRAW_REASONS as readonly string[]).includes(opts.reason)) return { ok: false, code: "reason_required", message: "Choose a reason for withdrawing." };
      if (state.status !== "approved") return bad("Only approved reports can be withdrawn from aggregation.");
      return { ok: true, next: "approved", changed: !state.withdrawn };
    }
    case "redact": {
      if (state.status === "rejected") return bad("Rejected reports have no text to redact.");
      return { ok: true, next: state.status, changed: state.unresolvedPii };
    }
    case "edit": {
      if (state.status === "rejected") return bad("Rejected reports can't be edited.");
      if (state.withdrawn) return bad("Withdrawn reports can't be edited.");
      if (!opts.structured) return { ok: false, code: "invalid_structured", message: "Nothing to edit." };
      const err = validateStructured(opts.structured);
      if (err) return { ok: false, code: "invalid_structured", message: err };
      return { ok: true, next: state.status, changed: true };
    }
  }
}
