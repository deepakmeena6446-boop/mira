/** Audit-only S1–S7 checklist. It contains no person, place, route, text or contact data. */
export type ScriptedDecisionCheck = {
  scenario: "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
  chosenOptionOrAction: boolean;
  requiredFactsChecked: boolean;
  liveSourceWhenRequired: boolean;
  unknownsVisible: boolean;
  confirmedNextState: boolean;
  scenarioMinimumMet: boolean;
  prohibitedClaim: boolean;
  consentBreach: boolean;
};

export type ScriptedDecisionResult = "PASS" | "PARTIAL" | "FAIL";

/** A page view, answer, private timer or closed journey cannot satisfy this rubric alone. */
export function scriptedDecisionResult(check: ScriptedDecisionCheck): ScriptedDecisionResult {
  if (check.prohibitedClaim || check.consentBreach || !check.unknownsVisible) return "FAIL";
  if (!check.chosenOptionOrAction || !check.requiredFactsChecked || !check.liveSourceWhenRequired || !check.confirmedNextState || !check.scenarioMinimumMet) return "PARTIAL";
  return "PASS";
}
