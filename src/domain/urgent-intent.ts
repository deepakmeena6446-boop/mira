/**
 * Urgent text signals shared by the client and server. Pure and clock-free.
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
  // "help", "help me pls", "pls help me now!!" — a bare plea, with the usual typing in a hurry.
  String.raw`^\s*(?:pl(?:ease|z|s)\s+)?help(?:\s+me)?(?:\s+(?:pl(?:ease|z|s)|now|asap|fast|quick(?:ly)?|someone))*\s*[!.?]*\s*$`,
  String.raw`\bhelp(?: me)?\s*!`,
  String.raw`\bsomeone help\b`,
  String.raw`\bneed help (?:now|right now|urgently)\b`,
  String.raw`\bsca+r+e*d+\b`, // scared, scard, scaredd
  String.raw`\bfrightened\b`,
  String.raw`\b(?:so|very|really|i'?m|i am|im)\s+afraid\b(?!\s+(?:that|the|it|so|not|i))`,
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
  String.raw`\bf[oa]l+o*w*i?n[g']?\s+me\b`, // folowing me, follwing me, followin me
  String.raw`\bsome(?:one|1|body)\b.*\bfol+o?w`,
  String.raw`\bcall\s+(?:the\s+)?(?:police|cops|ambulance|112|100|911|999)\b`, // Mira can't — point to the dialler
  String.raw`\bget\s+(?:me\s+)?help\b`,
  String.raw`\b(?:alert|inform)\s+(?:my\s+)?(?:sister|brother|mom|mum|mother|dad|father|parents?|family|friends?|husband|wife|partner|didi|bhai|papa|mummy|maa)\b`,
  String.raw`\bbach+a+o+\b`, // bachao, bachaoo, bachchao
  String.raw`\bda+r+\s*(?:lag|lg)\w*`, // dar lag, darr lag raha, dar lg rha
  String.raw`\bmadad\b`,
  String.raw`\bkhatr[ae]\b`,
  String.raw`\bkoi\s+(?:mera\s+|mere\s+)?pee?ch[aei]+\b`,
  String.raw`\bpee?ch[ea]+\s+(?:aa|a)\s*(?:raha|rha|rhi|rahi)\b`,
  String.raw`\b(?:follow|pi+ch+a)\s+kar\s*(?:raha|rha|rhi|rahi)\b`,
  String.raw`\bpolice\s+(?:ko\s+)?bula\w*`,
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
  "बचाओ", "बचा लो", "मदद", "मुझे डर", "डर लग", "कोई पीछा", "पीछे आ", "पीछा कर", "खतरे में", "ख़तरे में", "पुलिस बुला", // Hindi
  "النجدة", "ساعدوني", "ساعدني", "أنقذوني", "انقذوني", "في خطر", "يلاحقني", "يتبعني", // Arabic
  "助けて", "たすけて", "救命", "救救我", "살려주세요", "도와주세요", "помогите", "спасите", // Japanese, Chinese, Korean, Russian
];

export const DANGER = new RegExp(`${DANGER_LATIN.join("|")}|${DANGER_SCRIPT.join("|")}`, "i");
