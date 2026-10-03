import { describe, expect, it } from "vitest";
import { scriptedDecisionResult, type ScriptedDecisionCheck } from "../support/scripted-decision-rubric";

const checked: ScriptedDecisionCheck = { scenario: "S3", chosenOptionOrAction: true, requiredFactsChecked: true, liveSourceWhenRequired: true, unknownsVisible: true, confirmedNextState: true, scenarioMinimumMet: true, prohibitedClaim: false, consentBreach: false };

describe("scripted useful-decision rubric", () => {
  it("passes only a checked, chosen and confirmed scenario outcome", () => {
    expect(scriptedDecisionResult(checked)).toBe("PASS");
  });

  it("does not count fixture output, a page view, a private timer or a manual end as success", () => {
    for (const partial of [
      { liveSourceWhenRequired: false },
      { chosenOptionOrAction: false },
      { scenario: "S1" as const, scenarioMinimumMet: false },
      { scenario: "S4" as const, confirmedNextState: false },
    ]) expect(scriptedDecisionResult({ ...checked, ...partial })).toBe("PARTIAL");
  });

  it("fails false assurance, hidden unknowns and consent breaches", () => {
    for (const failure of [{ prohibitedClaim: true }, { unknownsVisible: false }, { consentBreach: true }]) {
      expect(scriptedDecisionResult({ ...checked, ...failure })).toBe("FAIL");
    }
  });
});
