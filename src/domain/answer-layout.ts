/**
 * Mira's reply laid out for scanning (design/mira-companion-ux). Presentation only: the text is exactly what the
 * server sent and the output guard checked — nothing is dropped, reworded or hidden. Sentences are only grouped:
 *  - `answer`: the practical facts, first, in her words' order (a fact keeps its own qualifier: "…daylight; this
 *    excludes weather and shade" stays whole);
 *  - `next`: what she can do next ("Review and choose an option…");
 *  - `limits`: sentences that only say what wasn't checked — shown, never folded away;
 *  - `sources`: attribution ("Source: © OpenStreetMap contributors…") — shown, as a provider requires.
 * Deterministic rules over the sentence itself; when they'd leave no answer, the reply stays one paragraph.
 */
export type AnswerLayout = { answer: string[]; next: string[]; limits: string[]; sources: string[] };

const SOURCE = /^sources?:|©/i;
const LIMIT = /\b(unverified|not verified|does not verify|doesn['’]t verify|not a safety comparison|not a measured|not a lighting or route check|only a reference)\b/i;
const NEXT = /^(review|choose|retry|you can (edit|change|retry|choose)|confirm with|open emergency)\b/i;

/** Sentence split that keeps "13.3 min/km", "6:30 AM" and "(ODbL)," inside their sentence. */
export function sentences(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z“"(©])/).map((s) => s.trim()).filter(Boolean);
}

export function layoutAnswer(text: string): AnswerLayout | null {
  if (/\n/.test(text.trim())) return null; // a reply that brings its own lines or lists keeps them
  const out: AnswerLayout = { answer: [], next: [], limits: [], sources: [] };
  for (const s of sentences(text)) {
    if (SOURCE.test(s)) out.sources.push(s);
    else if (NEXT.test(s)) out.next.push(s);
    // A limit carries no fact of its own: a sentence with a number in it stays in the answer.
    else if (LIMIT.test(s) && !/\d/.test(s)) out.limits.push(s);
    else out.answer.push(s);
  }
  if (!out.answer.length || out.answer.length + out.next.length === sentences(text).length) return null;
  return out;
}
