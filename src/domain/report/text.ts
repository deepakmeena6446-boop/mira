/**
 * Text normalisation and deterministic PII detection (architecture §5).
 * Runs on the server regardless of client behaviour; the client uses the same code
 * only to highlight spans in the user's own text before they submit.
 * Hindi, English and Hinglish are accepted as written — nothing is translated.
 */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** NFKC, strip control/format characters, collapse whitespace, trim. */
export function normaliseNarrative(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​⁠﻿‪-‮⁦-⁩]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function codePointLength(s: string): number {
  return [...s].length;
}

/** Map Devanagari digits to ASCII 1:1 (same UTF-16 length) so offsets are preserved. */
function asciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

export type PiiType = "email" | "phone" | "vehicle_plate" | "url" | "social_handle" | "address" | "id_number" | "possible_name";

export interface PiiSpan {
  type: PiiType;
  start: number;
  end: number;
}

export const PII_LABEL: Record<PiiType, string> = {
  email: "email address",
  phone: "phone number",
  vehicle_plate: "vehicle number plate",
  url: "link",
  social_handle: "social media handle",
  address: "address detail",
  id_number: "ID number",
  possible_name: "possible name",
};

const PATTERNS: Array<{ type: PiiType; re: RegExp }> = [
  { type: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { type: "url", re: /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+|\b[a-z0-9-]+\.(?:com|in|org|net|co|io|me|app|ly)\b(?:\/[^\s]*)?/gi },
  { type: "social_handle", re: /(?<![A-Z0-9._%+-])@[A-Za-z0-9_.]{2,30}/g },
  { type: "id_number", re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { type: "phone", re: /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}\b/g },
  // Indian registration plates: DL 3C AB 1234, DL3CAB1234, HR26DK8337, DL 1S 1234.
  // Restricted to real state/UT registration codes so ordinary words ("on 98765") don't match.
  {
    type: "vehicle_plate",
    re: /\b(?:AN|AP|AR|AS|BR|BH|CH|CG|DD|DL|DN|GA|GJ|HP|HR|JH|JK|KA|KL|LA|LD|MH|ML|MN|MP|MZ|NL|OD|OR|PB|PY|RJ|SK|TN|TR|TS|UK|UP|WB)[\s-]?\d{1,2}[\s-]?[A-Z]{0,3}[\s-]?[A-Z]{0,3}[\s-]?\d{3,4}\b/gi,
  },
  // Address cues in English, Hinglish and Hindi, followed by a number.
  {
    type: "address",
    re: /(?:\b(?:house|h\.?\s?no|flat|plot|room|block|door|gali|makaan|makan|quarter|qtr|sector)\b|मकान|फ्लैट|गली|कमरा)\.?\s*(?:no\.?|number|nambar|नंबर|#)?\s*[:\-]?\s*[A-Z]?[-/]?\d{1,4}[A-Z]?\b/gi,
  },
  { type: "address", re: /\b[1-8]\d{5}\b/g }, // six-digit PIN code
  {
    type: "possible_name",
    re: /(?:\b(?:my|his|her|their|the guy'?s|the man'?s)\s+name\s+(?:is|was)|\bnamed|\bcalled|\b(?:mera|uska|unka|iska)\s+naam|(?:मेरा|उसका|उनका|इसका)\s+नाम)\s*[:\-]?\s*[\p{L}][\p{L}\p{M}]+(?:\s+[\p{Lu}][\p{L}\p{M}]+)?/giu,
  },
];

/** Find potentially identifying spans. Overlaps are merged; offsets refer to `text`. */
export function detectPii(text: string): PiiSpan[] {
  const probe = asciiDigits(text);
  const raw: PiiSpan[] = [];
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of probe.matchAll(re)) {
      const value = m[0];
      const start = m.index ?? 0;
      if (type === "phone" && value.replace(/\D/g, "").length < 8) continue;
      if (type === "vehicle_plate" && !/\d/.test(value)) continue;
      raw.push({ type, start, end: start + value.length });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: PiiSpan[] = [];
  for (const s of raw) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      continue;
    }
    merged.push({ ...s });
  }
  return merged;
}

/** Summary safe to store: types and counts only, never the matched text. */
export function piiFlags(spans: PiiSpan[]): Array<{ type: PiiType; count: number }> {
  const counts = new Map<PiiType, number>();
  for (const s of spans) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, count }));
}

/** Replace detected spans with a neutral marker. */
export function redact(text: string, spans: PiiSpan[] = detectPii(text)): string {
  let out = "";
  let pos = 0;
  for (const s of spans) {
    out += text.slice(pos, s.start) + "[removed]";
    pos = s.end;
  }
  return out + text.slice(pos);
}
