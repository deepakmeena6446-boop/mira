/**
 * One-shot hand-off of a question from Home (or a brief) to the Mira screen. In memory only: the text
 * can name places, so it never goes into a URL, and a reload simply drops it. `ephemeral`: the question
 * comes from an outing or a place (Home's ask, Plan, Around), so the conversation it starts — follow-ups
 * included — is not kept in chat history (sprint mira-companion-48h 03 §E).
 */
let pending: { text: string; ephemeral: boolean } | null = null;

export function handOffAsk(text: string, { ephemeral = true }: { ephemeral?: boolean } = {}) {
  const t = text.trim().slice(0, 1000);
  pending = t ? { text: t, ephemeral } : null;
}

export function takeHandedOff(): { text: string; ephemeral: boolean } | null {
  const handed = pending;
  pending = null;
  return handed;
}

export function takeHandedOffAsk(): string | null {
  return takeHandedOff()?.text ?? null;
}
