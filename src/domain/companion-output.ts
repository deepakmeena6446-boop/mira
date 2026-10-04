/**
 * Deterministic guard for untrusted model text before any part reaches the user.
 *
 * Mira replies in the person's language, so the guard is multilingual, and it matches on a
 * normalised copy of the text: NFKC (full-width forms), curly apostrophes folded to ', invisible
 * characters dropped, and — in a second view — Cyrillic/Greek lookalikes folded to Latin, so
 * "ѕafe" can't pass as a different word. Russian is matched on the unfolded view.
 *
 * Verdicts are matched strictly (any verdict word left after removing a short list of allowed
 * constructions is rejected): a false positive costs one fixed line, a false negative tells
 * someone a street is safe. Pure (no server-only): also used by scripts/mira-eval.ts.
 */
import { emergencyActions, type CountryContext } from "./country-context";

export type CompanionOutputIssue = "safety_verdict" | "invented_action" | "unsupported_promise" | "unsupported_emergency_number";

const CONFUSABLES: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ѕ: "s", і: "i", ј: "j", ԁ: "d", ӏ: "l", һ: "h", ԛ: "q", ԝ: "w",
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X", Ѕ: "S", І: "I", Ј: "J",
  α: "a", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x",
  Α: "A", Β: "B", Ε: "E", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X", Ζ: "Z",
};
const CONFUSABLE_RX = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "gu");

/** NFKC, straight apostrophes/quotes, no invisible characters, single spaces. */
export function normaliseForCheck(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛ʼ′´`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[­​-‏⁠﻿]/g, "")
    .replace(/[ \t  -   　]+/g, " ");
}

const foldConfusables = (s: string) => s.replace(CONFUSABLE_RX, (c) => CONFUSABLES[c]);

// Letter-aware word boundaries: JS \b is ASCII-only, so "sûr" or "güvenli" need these.
const B = String.raw`(?<![\p{L}\p{N}_])`;
const E = String.raw`(?![\p{L}\p{N}_])`;
const rx = (src: string) => new RegExp(src, "giu");

// ── Safety verdicts ──────────────────────────────────────────────────────────────────────────

const EN_VERDICT = String.raw`(?:safe|safer|safest|safely|unsafe|dangerous|dangerously|risky|sketchy|dodgy)`;

/**
 * Constructions that contain a verdict word without asserting a verdict. Removed before the
 * verdict check; everything else with a verdict word is rejected.
 */
const EN_ALLOWED = [
  // "I can't tell you whether this area is safe", "I don't know if the route is safe or not".
  rx(String.raw`\b(?:know|say|tell|judge|verify|check|confirm|determine|assess|ask|asked|asking|sure|decide|rate)\w*(?:\s+[\w']+){0,2}?\s+(?:whether|if)\s+[^.!?\n,;]{0,80}?${B}${EN_VERDICT}${E}(?:\s+or\s+(?:not|${EN_VERDICT}))?`),
  // "I can't call it safe or unsafe", "I never label places as safe or dangerous".
  rx(String.raw`\b(?:can't|cannot|can not|couldn't|could not|don't|do not|won't|will not|wouldn't|never|not able to|unable to|no way to)\s+(?:[\w']+\s+){0,2}?(?:say|tell|call|label|judge|claim|confirm|promise|guarantee|rate|rank|know|verify|assess|describe|mark)\w*(?:\s+(?!but\b|though\b|although\b|however\b|yet\b)[\w']+){0,5}?\s+${EN_VERDICT}${E}(?:\s*(?:,|or|and|\/)\s*(?:not\s+)?${EN_VERDICT}${E})*`),
  // Her feeling, and the app's "I feel unsafe" button — not a verdict on a place.
  rx(String.raw`(?<!\b(?:will|'ll|would|'d|make you|makes you)\s)\b(?:feel|feels|feeling|felt)\s+(?:un)?safer?${E}`),
  // Movement imperatives: "get somewhere safe", "go to a safe place" (no place is being labelled).
  rx(String.raw`\b(?:get|go|head|move|run|walk|stay|wait|find|reach)\s+(?:to\s+|into\s+)?(?:(?:somewhere|someplace|some place|anywhere)\s+safer?|a\s+safer?\s+place)${E}`),
  // Her state as a condition: "once you're safe, call Priya".
  rx(String.raw`\b(?:once|when|until|if|as soon as|after)\s+you(?:'re| are| feel)\s+(?:safe|safer)${E}`),
];
/** A question ("Are you safe right now?") asserts nothing — unless it ranks (safer / safest). */
const EN_QUESTION = rx(String.raw`[^.!?\n]*${B}(?:safe|unsafe|dangerous|risky)${E}[^.!?\n]*\?`);

const VERDICT_PATTERNS: RegExp[] = [
  rx(`${B}${EN_VERDICT}${E}`),
  // Spanish / Portuguese / Italian
  rx(String.raw`${B}(?:in)?segur[oa]s?${E}|${B}peligros[oa]s?${E}|${B}perigos[oa]s?${E}|${B}sin peligro${E}|${B}sem perigo${E}|${B}a salvo${E}|${B}(?:in)?sicur[oaie]${E}|${B}pericolos[oaie]${E}|${B}al sicuro${E}`),
  // French: "sûr" is also "sure" ("bien sûr"), handled in the allowed list below.
  rx(String.raw`${B}sûre?s?${E}|${B}(?:est|sont|soit|sera|serait|reste|semble|pas|très|plutôt|assez)\s+sures?${E}|${B}dangereu(?:x|se|ses)${E}|${B}sans danger${E}|${B}en sécurité${E}`),
  // German
  rx(String.raw`${B}(?:un)?sicher(?:e|en|er|es|em)?${E}|${B}(?:un)?gefährlich(?:e|en|er|es|em)?${E}`),
  // Indonesian / Malay ("Aman" is also a given name, so only verdict constructions)
  rx(String.raw`${B}berbahaya${E}|${B}(?:tidak|tak|kurang|sangat|cukup|lebih|paling|tempat|daerah|kawasan|area|jalan|rute|ini|itu|akan|sudah|sini|sana|tetap)\s+aman${E}|${B}aman\s+(?:untuk|kok|saja|sekali|di sini|di sana)${E}|${B}dengan aman${E}`),
  // Turkish (güvenlik = security, the noun)
  rx(String.raw`${B}güvenli(?!k)\p{L}*|${B}güvensiz\p{L}*|${B}tehlikeli\p{L}*|${B}tehlikesiz\p{L}*|${B}güvende${E}`),
  // Hindi (romanised and Devanagari)
  rx(String.raw`${B}a?surakshit${E}|${B}khatarn[a]{1,2}k${E}|सुरक्षित|खतरनाक|ख़तरनाक`),
  // Russian (безопасность / опасность are the nouns)
  rx(String.raw`${B}(?:не)?безопас(?!ност)\p{L}*|${B}опас(?!ност|а[тюел])\p{L}*|в безопасности`),
  // Arabic
  rx(String.raw`آمن|بأمان|خطير`),
  // Japanese / Chinese (安全 alone is also the noun, as in "safety updates")
  rx(String.raw`安全(?:です|だ|な|に|では|じゃ|とは|だと|的|吗|嗎|了|地)|(?:很|不|挺|比较|比較|非常|相当|是|算|够|夠|最|更)安全|一路平安|注意安全|危険(?:です|だ|な|では|じゃ|とは|だと)|(?:很|不|挺|比较|非常|相当|是|有点|最|更)危[险險]|危[险險](?:的|吗|嗎|了)`),
  // Korean (안전 / 위험 alone are nouns)
  rx(String.raw`안전(?:하|한|해|합|했)|위험(?:하|한|해|합|했)`),
];

// Hinglish (romanised Hindi with English verdict words): "koi route safe nahi bol sakti", "safe hai ya nahi ye main nahi
// bata sakti", "safe feel karo". Without these, a refusal written in Hinglish was itself rejected as a verdict.
const HINGLISH_VERDICT = String.raw`(?:safe|unsafe|safer|surakshit|asurakshit|khatarnaa?k|risky|dangerous)`;
const HINGLISH_ALLOWED = [
  rx(String.raw`${B}${HINGLISH_VERDICT}(?:\s+(?:ya|or|aur)\s+(?:${HINGLISH_VERDICT}|nahi|nahin|nhi))?\s+(?:hai|hain|he|h)?\s*(?:ya|or)\s+(?:nahi|nahin|nhi)${E}`),
  rx(String.raw`${B}${HINGLISH_VERDICT}(?:\s+(?:ya|or)\s+${HINGLISH_VERDICT})?\s+(?:hai\s+)?(?:ye\s+|yeh\s+|main\s+|mai\s+|mein\s+)*(?:nahi|nahin|nhi|na)\s+(?:bol|keh|kah|bata|bta|maan|judge|decide|tay|guarantee|promise)\p{L}*`),
  rx(String.raw`${B}(?:un)?safe\s+(?:feel|mehsoos|mahsoos)\s*(?:(?:na|nahi|nahin)\s+)?(?:kar|ho|hu|hoon|nahi)\p{L}*`),
  // "main safe routes judge nahi kar sakti", "kaunsa area safe hai ye decide nahi kar sakti"
  rx(String.raw`${B}${HINGLISH_VERDICT}(?:\s+[\p{L}']+){0,3}?\s+(?:judge|decide|tay|guarantee|confirm|verify)\s+(?:nahi|nahin|nhi|na)\s+(?:kar|ho)\p{L}*`),
];

const OTHER_ALLOWED = [
  ...HINGLISH_ALLOWED,
  rx(String.raw`${B}bien sûr${E}|${B}(?:suis|es|sommes|êtes)\s+(?:pas\s+|vraiment\s+|tout à fait\s+)?sûre?s?${E}`), // "of course", "I'm sure"
  rx(String.raw`${B}(?:bin|bist|sind|seid)\s+(?:mir|dir|uns|euch)?\s*(?:nicht\s+|ganz\s+|sehr\s+)*sicher${E}`), // "ich bin mir sicher"
  rx(String.raw`${B}(?:estoy|estás|está|estamos|no estoy|estou|está|sono|sei|siamo)\s+(?:muy\s+|del todo\s+|tan\s+)?segur[oa]s?${E}|${B}(?:sono|sei|siamo)\s+(?:del tutto\s+)?sicur[oaie]${E}`), // "I'm (not) sure"
];

function hasVerdict(view: string): boolean {
  let t = view;
  for (const a of [...EN_ALLOWED, ...OTHER_ALLOWED]) t = t.replace(a, " ");
  t = t.replace(EN_QUESTION, (q) => (/\b(?:safer|safest)\b/i.test(q) ? q : " "));
  return VERDICT_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(t);
  });
}

// ── Actions MIRA never takes on its own ──────────────────────────────────────────────────────

const DONE_VERBS = String.raw`(?:shared|texted|messaged|emailed|e-mailed|told|informed|alerted|notified|warned|let\s+(?:[\w']+\s+){1,3}?know|started|begun|sent|forwarded|called|rang|rung|phoned|dialled|dialed|contacted|pinged|set up|booked|reported|filed|submitted|saved|activated|turned on|switched on)`;
const PASSIVE_VERBS = String.raw`(?:notified|alerted|told|informed|sent|emailed|texted|messaged|contacted|called|pinged|warned|shared|let know)`;
const PROMISE_VERBS = String.raw`(?:let|tell|text|message|email|e-mail|notify|alert|call|ring|phone|contact|ping|send|share|inform|warn|update|start)`;
const HEDGE_SUBJECT = String.raw`(?!(?:may|might|could|would|should|must|will|not|never|nobody|no one|noone|none|nothing|who)\b)`;
const CONDITION = String.raw`(?<!\b(?:once|when|after|if|until|before|soon as|unless)\s+(?:your\s+|the\s+|her\s+)?)`;

const ACTION_PATTERNS: RegExp[] = [
  // "I've notified Priya", "I shared your trip with Priya", "we have let your Circle know"
  rx(String.raw`\b(?:i|we|mira)(?:'ve|\s+have|\s+had)?\s+(?:already\s+|just\s+|now\s+|also\s+|gone ahead and\s+)?${DONE_VERBS}\b`),
  // "Priya has been notified", "Your Circle has been alerted", "A link was sent"
  rx(String.raw`${B}${HEDGE_SUBJECT}[\p{L}][\p{L}-]*(?:\s+(?:has|have|had|was|were|got)\s+(?:already\s+|just\s+|now\s+|also\s+)?(?:been\s+)?|(?:'s|'ve)\s+(?:already\s+|just\s+|now\s+|also\s+)?been\s+)${PASSIVE_VERBS}\b`),
  // "Your trip has started", "Trip started!", "sharing is live"
  rx(String.raw`${CONDITION}\b(?:trip|journey|sharing|live share|live link|live location|tracking|walk)\s+(?:has\s+(?:now\s+|just\s+|already\s+)?|is\s+(?:now\s+)?|'s\s+(?:now\s+)?)?(?:started|begun|live|been started|been shared|been sent|underway|under way)\b`),
  // "Priya can see you now", "they can now follow you"
  rx(String.raw`\b(?:can|could)\s+now\s+(?:see|follow|track|watch)\b|\b(?:can|could)\s+(?:see|follow|track|watch)\s+(?:you|your|where you are|along)[^.!?\n]{0,30}?\bnow\b`),
  // Spanish / Portuguese / French / Italian / German
  rx(String.raw`${B}(?:he|hemos|ya|ya he)\s+(?:avisado|notificado|alertado|enviado|compartido|informado|llamado|contactado|iniciado|empezado)${E}|${B}(?:avisé|notifiqué|alerté|envié|compartí|llamé|informé)${E}|${B}(?:avisei|notifiquei|alertei|enviei|compartilhei|partilhei|liguei|informei)${E}`),
  rx(String.raw`${B}(?:j'ai|nous avons|on a)\s+(?:déjà\s+|bien\s+)?(?:prévenu|averti|alerté|notifié|envoyé|partagé|informé|appelé|contacté|lancé|démarré|commencé)${E}|${B}(?:a|ont)\s+été\s+(?:prévenue?s?|alertée?s?|notifiée?s?|informée?s?|averti(?:e|s|es)?)${E}`),
  rx(String.raw`${B}ho\s+(?:già\s+)?(?:avvisato|avvertito|notificato|allertato|inviato|condiviso|chiamato|informato|avviato)${E}|${B}(?:ich habe|wir haben|hab)\s+(?:[\p{L}]+\s+){0,3}?(?:benachrichtigt|informiert|alarmiert|gesendet|geschickt|geteilt|angerufen|gestartet)${E}`),
  // Hinglish / Indonesian / Turkish / Russian / Arabic / Japanese / Chinese / Korean
  rx(String.raw`${B}(?:bata|bhej|share kar|inform kar|message kar|call kar|alert kar|bol)\s+(?:diya|di|diye|dia)${E}|${B}sudah\s+(?:memberi tahu|memberitahu|mengirim|membagikan|menghubungi)${E}|${B}(?:haber verdim|bildirdim|paylaştım|gönderdim)${E}`),
  rx(String.raw`${B}(?:уведомил|сообщил|отправил|предупредил|оповестил)[аи]?${E}|أبلغت|أرسلت|أخبرت|(?:通知|送信|連絡|共有)しました|知らせました|已经?(?:通知|发送|發送|告诉|告訴|分享)|알렸|보냈|공유했|통지했`),
];

const PROMISE_PATTERNS: RegExp[] = [
  // "I'll let your Circle know", "I'll text them", "MIRA will email your contacts"
  rx(String.raw`\b(?:i|we|mira)(?:'ll|\s+will|\s+shall|\s+am going to|'m going to|\s+is going to)\s+(?:also\s+|now\s+|just\s+|then\s+|go ahead and\s+|automatically\s+|immediately\s+)?${PROMISE_VERBS}\b`),
  // "They'll be notified", "your Circle will be alerted"
  rx(String.raw`\b(?:will|'ll)\s+(?:also\s+|then\s+|automatically\s+|immediately\s+)?be\s+(?:notified|alerted|told|informed|emailed|texted|messaged|contacted|called|sent)\b`),
];

// ── Emergency numbers ────────────────────────────────────────────────────────────────────────

/** Words that make a nearby digit run a phone number (English and the main languages Mira speaks). */
const NUMBER_CUE_BEFORE = rx(String.raw`${B}(?:call|calling|dial|dialling|dialing|ring|phone|number|numbers|no\.|helpline|hotline|police|ambulance|fire|emergency|sos|llam\p{L}*|marc\p{L}*|número|numero|policía|polizia|polícia|appel\p{L}*|compos\p{L}*|numéro|ruf\p{L}*|wähl\p{L}*|nummer|notruf|polizei|chiam\p{L}*|ligue|disque|hubungi|nomor|polisi|arayın|numara|polis|nambar)${E}|पुलिस|नंबर|कॉल|звон\p{L}*|номер|полиц\p{L}*|اتصل|رقم|الشرطة|電話|番号|警察|电话|號碼|号码|报警|전화|번호|경찰`);
const NUMBER_CUE_AFTER = /^\s*(?:is|are|—|–|-|:|\()?\s*(?:the\s+|your\s+|a\s+)?(?:\p{L}+\s+)?(?:emergency|police|ambulance|helpline|hotline|number)/iu;
/** A run of digits with at most one separator between them ("9-1-1", "1 1 2", "0808 2000 247"). */
const DIGIT_RUN = /(?<!\d)\d(?:[ .\-–]?\d)*(?!\d)/gu;
/** Times, distances, durations, percentages: never phone numbers. */
const NOT_A_PHONE_AFTER = /^\s*(?:%|:\d|\/\d|-?\s*(?:min|mins|minutes?|m|km|metres?|meters?|am|pm|a\.m|p\.m|h|hrs?|hours?|sec|seconds?|°|people|places|stops?)\b)/iu;

const digitsOnly = (s: string) => s.replace(/\D/g, "");

function unsupportedNumber(view: string, allowed: Set<string>): boolean {
  for (const m of view.matchAll(DIGIT_RUN)) {
    const digits = digitsOnly(m[0]);
    if (digits.length < 2 || digits.length > 15) continue;
    const at = m.index ?? 0;
    const end = at + m[0].length;
    const after = view.slice(end, end + 30);
    if (NOT_A_PHONE_AFTER.test(after) || /\d:$/.test(view.slice(Math.max(0, at - 3), at))) continue;
    const sentence = view.slice(Math.max(0, at - 40), at).split(/[.!?\n](?=\s|$)/).pop() ?? "";
    NUMBER_CUE_BEFORE.lastIndex = 0;
    if (!NUMBER_CUE_BEFORE.test(sentence) && !NUMBER_CUE_AFTER.test(after)) continue;
    if (!allowed.has(digits)) return true;
  }
  return false;
}

/** Every number Mira may state for this country: reviewed emergency numbers and helplines. */
export function allowedNumbers(ctx: CountryContext): string[] {
  return [...emergencyActions(ctx).map((n) => n.number), ...ctx.helplines.map((h) => h.number)];
}

/**
 * `checkVerdicts: false` (Mira's chat): safety wording is left to the model's own understanding of her language — a word
 * filter can't tell "main koi route safe nahi bol sakti" from a verdict, and rejecting a whole helpful answer for it
 * ruined replies (owner, 2026-10-04). Verdict words are still logged (mira.verdict_word). Invented actions, promises and
 * unverified emergency numbers are still caught: those can hurt someone.
 */
export function companionOutputIssue(text: string, allowedEmergencyNumbers: readonly string[], { checkVerdicts = true }: { checkVerdicts?: boolean } = {}): CompanionOutputIssue | null {
  const norm = normaliseForCheck(text);
  const folded = foldConfusables(norm);
  const views = folded === norm ? [norm] : [norm, folded];
  if (checkVerdicts && views.some(hasVerdict)) return "safety_verdict";
  const hit = (ps: RegExp[]) => views.some((v) => ps.some((p) => ((p.lastIndex = 0), p.test(v))));
  if (hit(ACTION_PATTERNS)) return "invented_action";
  if (hit(PROMISE_PATTERNS)) return "unsupported_promise";
  const allowed = new Set(allowedEmergencyNumbers.map(digitsOnly).filter(Boolean));
  if (views.some((v) => unsupportedNumber(v, allowed))) return "unsupported_emergency_number";
  return null;
}

// ── Circle wording ───────────────────────────────────────────────────────────────────────────

const listNames = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * What starting a shared journey does for her Circle, never promising delivery. `names`: accepted
 * email contacts (shareTargets) — MIRA tries to email them, only when email is switched on.
 * `whatsapp`: contacts with a number — she sends them her link herself (MIRA opens WhatsApp; it
 * never sends). `email` undefined = a card saved before this was known.
 */
export function circleSharingLine(names: string[], email: boolean | undefined, whatsapp: string[] = []): string {
  const wa = whatsapp.length ? `After you start, send ${listNames(whatsapp)} your live link on WhatsApp in one tap (you press Send).` : "";
  const byEmail = !names.length
    ? ""
    : email === true
      ? `MIRA will try to email ${listNames(names)} your live link when you start (sending can fail).`
      : email === false
        ? wa ? "" : "Email isn't switched on, so share your live link yourself after you start."
        : `Share your live link with ${listNames(names)} after you start.`;
  return [wa, byEmail].filter(Boolean).join(" ");
}
