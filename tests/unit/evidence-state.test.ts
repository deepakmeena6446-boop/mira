import { describe, expect, it } from "vitest";
import { evidenceState } from "@/domain/evidence-state";

const ready = { source: "OpenStreetMap", state: "ready" } as const;
const failed = { source: "Mapillary", state: "failed", retryable: true } as const;
const unavailable = { source: "Mapillary", state: "unavailable" } as const;

describe("evidence source state", () => {
  it("distinguishes successful empty lookup from evidence", () => {
    expect(evidenceState([], false, [ready]).state).toBe("empty");
    expect(evidenceState([1], true, [ready])).toMatchObject({ state: "ready", data: [1] });
  });
  it("preserves successful data when another source fails or is unconfigured", () => {
    expect(evidenceState([1], true, [ready, failed])).toMatchObject({ state: "partial", data: [1] });
    expect(evidenceState([1], true, [ready, unavailable])).toMatchObject({ state: "partial", data: [1] });
  });
  it("does not turn total failure into an empty list on HTTP 200", () => {
    expect(evidenceState([], false, [failed])).toMatchObject({ state: "failed", retryable: true });
    expect(evidenceState([], false, [unavailable])).toMatchObject({ state: "unavailable", retryable: false });
  });
});
