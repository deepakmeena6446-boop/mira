/**
 * One-shot hand-off of a question from Home (or a brief) to the Mira screen. In memory only: the text
 * can name places, so it never goes into a URL, and a reload simply drops it.
 */
let pending: string | null = null;

export function handOffAsk(text: string) {
  pending = text.trim().slice(0, 1000) || null;
}

export function takeHandedOffAsk(): string | null {
  const text = pending;
  pending = null;
  return text;
}
