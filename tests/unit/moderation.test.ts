import { describe, expect, it } from "vitest";
import { decide, validateStructured } from "@/domain/moderation";

const s = { category: "environment" as const, tags: ["poor_lighting"], timeBand: "late" as const };
const st = (status: "pending" | "held" | "approved" | "rejected", unresolvedPii = false, withdrawn = false) => ({ status, unresolvedPii, withdrawn });

describe("moderation state machine", () => {
  it("approves pending or held reports with valid structured fields", () => {
    expect(decide(st("pending"), "approve", { structured: s })).toEqual({ ok: true, next: "approved", changed: true });
    expect(decide(st("held"), "approve", { structured: s })).toMatchObject({ ok: true, next: "approved" });
  });
  it("is idempotent", () => {
    expect(decide(st("approved"), "approve", { structured: s })).toEqual({ ok: true, next: "approved", changed: false });
    expect(decide(st("rejected"), "reject", { reason: "duplicate" })).toEqual({ ok: true, next: "rejected", changed: false });
    expect(decide(st("held"), "hold", { reason: "unclear" })).toMatchObject({ changed: false });
  });
  it("blocks approval while PII is unresolved", () => {
    expect(decide(st("held", true), "approve", { structured: s })).toMatchObject({ ok: false, code: "pii_unresolved" });
  });
  it("rejects invalid structured tags", () => {
    expect(decide(st("pending"), "approve", { structured: { ...s, tags: ["call 98765"] } })).toMatchObject({ ok: false, code: "invalid_structured" });
    expect(validateStructured({ ...s, tags: ["good_lighting"] })).toMatch(/not allowed/);
  });
  it("requires fixed reason codes for hold, reject and withdraw", () => {
    expect(decide(st("pending"), "reject", {})).toMatchObject({ ok: false, code: "reason_required" });
    expect(decide(st("pending"), "reject", { reason: "free text with a name" })).toMatchObject({ ok: false, code: "reason_required" });
    expect(decide(st("pending"), "hold", { reason: "needs_redaction" })).toMatchObject({ ok: true, next: "held" });
  });
  it("prevents invalid transitions", () => {
    expect(decide(st("rejected"), "approve", { structured: s }).ok).toBe(false);
    expect(decide(st("approved"), "reject", { reason: "duplicate" }).ok).toBe(false);
    expect(decide(st("pending"), "withdraw", { reason: "privacy_risk" }).ok).toBe(false);
    expect(decide(st("approved"), "withdraw", { reason: "privacy_risk" })).toMatchObject({ ok: true, changed: true });
    expect(decide(st("approved", false, true), "withdraw", { reason: "privacy_risk" })).toMatchObject({ ok: true, changed: false });
  });
});
