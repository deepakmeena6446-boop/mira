/** Deterministic guard for untrusted model text before any part reaches the user. */
export function companionOutputIssue(text: string, allowedEmergencyNumbers: readonly string[]): string | null {
  if (/\b(safe|safer|safest|unsafe|dangerous|peligros[oa]s?|dangereu(?:x|se)|gefährlich)\b|(असुरक्षित|सुरक्षित|खतरनाक|خطير|آمن|危険|安全)/iu.test(text)) return "safety_verdict";
  if (/\b(?:i|mira|we) (?:have |already )?(?:started|set up|sent|alerted|notified|emailed|called|booked)\b/i.test(text) || /\b(?:your (?:journey|trip) (?:is|has been) (?:started|set up)|(?:contacts|people) (?:were|have been) (?:alerted|notified|emailed))\b/i.test(text)) return "invented_action";
  if (/\b(?:will|going to) (?:email|notify|alert|call) (?:your |the )?(?:contacts|circle|people|emergency)\b/i.test(text)) return "unsupported_promise";
  for (const match of text.matchAll(/\b(?:call|dial|emergency(?: number)? (?:is|:))\s*(\d{2,6})\b/gi)) if (!allowedEmergencyNumbers.includes(match[1])) return "unsupported_emergency_number";
  return null;
}
