import { describe, expect, it } from "vitest";
import { companionOutputIssue } from "@/domain/companion-output";

describe("model output guard", () => {
  const numbers = ["999", "112"];
  it.each([
    ["Safe trip!", "safety_verdict"],
    ["This route is safe.", "safety_verdict"],
    ["I started your trip.", "invented_action"],
    ["Your contacts have been alerted.", "invented_action"],
    ["I will email your contacts.", "unsupported_promise"],
    ["Call 911 now.", "unsupported_emergency_number"],
  ])("rejects %s", (text, reason) => expect(companionOutputIssue(text, numbers)).toBe(reason));
  it("allows checked options and evidence language", () => {
    expect(companionOutputIssue("Call 999 for emergency help.", numbers)).toBeNull();
    expect(companionOutputIssue("Mapped lighting covers 68% of the walk; 32% is unknown.", numbers)).toBeNull();
  });
});
