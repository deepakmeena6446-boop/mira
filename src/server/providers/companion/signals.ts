export { DANGER } from "@/domain/urgent-intent";

/** A safety verdict in a reply (measured, not blocked): safe / unsafe / dangerous and a few translations. */
const VERDICT = /\b(safe|safer|safest|unsafe|dangerous|peligros[oa]s?|dangereu(?:x|se)|gefährlich)\b|(असुरक्षित|सुरक्षित|खतरनाक|خطير|آمن|危険|安全)/giu;

/** Distinct verdict words (lower-cased) found in a reply — for a count-only log line, never the text. */
export function verdictWords(text: string): string[] {
  return [...new Set([...text.matchAll(VERDICT)].map((m) => m[0].toLowerCase()))];
}

/** Questions MIRA has no verified data for: area safety, crime, danger, reputations. */
export const JUDGEMENT = /\b(is (?:it|this|that|the|my|[a-z]+) .{0,40}\b(?:safe|unsafe|dangerous|sketchy|dodgy)|safe to\b|(?:safe|dangerous|unsafe|sketchy) (?:area|neighbou?rhood|place|city|street|route)|crime|criminal|robber|mugg|neighbou?rhood safe|how safe|safest|es seguro|es peligros|c'est dangereux|est-ce (?:sûr|dangereux)|ist es (?:sicher|gefährlich)|surakshit|khatarnak)|सुरक्षित|खतरनाक|آمن|خطير/iu;
