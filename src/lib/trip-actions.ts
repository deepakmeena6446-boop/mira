/**
 * The one next action on an open journey (docs/launch-ux/06 §3.5): exactly one filled button.
 * At the start the important act is getting the link to her people; once they can follow (or she
 * has opened WhatsApp for each), it's "I'm here". A missed check-in always puts "I'm here" first.
 */
/** `id`: the contact whose WhatsApp chat is next — by id, never by name (two contacts can share a name). */
export type NextAction = { kind: "whatsapp"; id: string } | { kind: "share" } | { kind: "arrive" };

/** `whatsapp` and `opened` are contact ids. */
export function journeyNextAction(i: { missed: boolean; whatsapp: string[]; opened: string[]; following: number; canShare: boolean }): NextAction {
  if (i.missed) return { kind: "arrive" };
  const unopened = i.whatsapp.find((n) => !i.opened.includes(n));
  if (unopened) return { kind: "whatsapp", id: unopened };
  if (!i.following && !i.whatsapp.length && i.canShare) return { kind: "share" };
  return { kind: "arrive" };
}
