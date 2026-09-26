/**
 * Deterministic text signals shared by both Mira engines. Pure (no server-only): the
 * evaluation script and unit tests use them directly.
 */

/**
 * Words that always surface the emergency card, before and whatever the model does.
 * Tuned for few false positives: "dangerous" (a question about a place) is not "in danger",
 * and everyday uses of "help"/"ayuda"/"Hilfe" ("can you help me find…") don't match — only
 * the forms people use when they need help now. Non-Latin scripts have no \b in JS regexes,
 * so those phrases are matched as written.
 */
const DANGER_LATIN = [
  // English (+ Hinglish)
  String.raw`\bin danger\b`,
  String.raw`\bdanger\b`,
  String.raw`^\s*(?:please\s+)?help(?: me)?(?: please)?\s*[!.]*\s*$`,
  String.raw`\bhelp(?: me)?\s*!`,
  String.raw`\bsomeone help\b`,
  String.raw`\bneed help (?:now|right now|urgently)\b`,
  String.raw`\bscared\b`,
  String.raw`\bterrified\b`,
  String.raw`\bemergency\b(?!\s+(?:number|numbers|services?\s+number|contacts?|info))`,
  String.raw`\bthreat(?:en\w*)?\b`,
  String.raw`\battack(?:ed|ing)?\b`,
  String.raw`\bassault(?:ed|ing)?\b`,
  String.raw`\bgrabbed me\b`,
  String.raw`\bchasing me\b`,
  String.raw`\bfollowing me\b`,
  String.raw`\bis following\b`,
  String.raw`\bbeing followed\b`,
  String.raw`\bsomeone.*follow`,
  String.raw`\bbacha+o\b`,
  String.raw`\bdar lag`,
  String.raw`\bkoi peech?a\b`,
  // Spanish / Portuguese
  String.raw`^\s*ayuda\b`,
  String.raw`\bayuda\s*!`,
  String.raw`\bnecesito ayuda\b`,
  String.raw`\bauxilio\b`,
  String.raw`\bsocorro\b`,
  String.raw`\bme (?:est[aá]n? )?siguiendo\b`,
  String.raw`\ben peligro\b`,
  // French
  String.raw`\bau secours\b`,
  String.raw`(?:^|\s)[aà] l'aide\b`,
  String.raw`\bon me suit\b`,
  String.raw`\bquelqu'un me suit\b`,
  // German / Italian / Turkish / Swahili
  String.raw`^\s*hilfe\b`,
  String.raw`\bhilfe\s*!`,
  String.raw`\bhilf mir\b`,
  String.raw`\bwerde verfolgt\b`,
  String.raw`\bin gefahr\b`,
  String.raw`\baiuto\b`,
  String.raw`\bimdat\b`,
  String.raw`\bnisaidie\b`,
];
const DANGER_SCRIPT = [
  "बचाओ", "मदद करो", "मुझे डर", "कोई पीछा", "खतरे में", "ख़तरे में", // Hindi
  "النجدة", "ساعدوني", "ساعدني", "أنقذوني", "انقذوني", "في خطر", "يلاحقني", "يتبعني", // Arabic
  "助けて", "たすけて", "救命", "救救我", "살려주세요", "도와주세요", "помогите", "спасите", // Japanese, Chinese, Korean, Russian
];

export const DANGER = new RegExp(`${DANGER_LATIN.join("|")}|${DANGER_SCRIPT.join("|")}`, "i");

/** A safety verdict in a reply (measured, not blocked): safe / unsafe / dangerous and a few translations. */
const VERDICT = /\b(safe|safer|safest|unsafe|dangerous|peligros[oa]s?|dangereu(?:x|se)|gefährlich)\b|(असुरक्षित|सुरक्षित|खतरनाक|خطير|آمن|危険|安全)/giu;

/** Distinct verdict words (lower-cased) found in a reply — for a count-only log line, never the text. */
export function verdictWords(text: string): string[] {
  return [...new Set([...text.matchAll(VERDICT)].map((m) => m[0].toLowerCase()))];
}

/** Questions MIRA has no verified data for: area safety, crime, danger, reputations. */
export const JUDGEMENT = /\b(is (?:it|this|that|the|my|[a-z]+) .{0,40}\b(?:safe|unsafe|dangerous|sketchy|dodgy)|safe to\b|(?:safe|dangerous|unsafe|sketchy) (?:area|neighbou?rhood|place|city|street|route)|crime|criminal|robber|mugg|neighbou?rhood safe|how safe|safest|es seguro|es peligros|c'est dangereux|est-ce (?:sûr|dangereux)|ist es (?:sicher|gefährlich)|surakshit|khatarnak)|सुरक्षित|खतरनाक|آمن|خطير/iu;
