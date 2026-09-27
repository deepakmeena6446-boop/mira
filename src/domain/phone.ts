/**
 * Phone numbers for the Circle, and the WhatsApp links MIRA opens with them. MIRA never sends
 * a WhatsApp message itself: it opens WhatsApp with the message ready, and she taps Send. So the
 * app can only ever say it *opened* WhatsApp for someone — never that they were told.
 */

/** E.164: "+" then 8–15 digits, the first not 0 ("+919876543210"). */
export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Turn what she typed into E.164, or null when it can't be a reachable number. `callingCode` is
 * her country's code from data/countries/registry.json ("+91"), used when she types a local
 * number without one; null when her country isn't known (then only an international "+…" works).
 *
 * Inputs she might type: "98765 43210", "098765 43210", "+91 98765-43210", "0091 9876543210",
 * "(020) 7946 0958" in the UK, "+44 (0)20 7946 0958".
 */
export function normalizePhone(raw: string, callingCode: string | null): string | null {
  // TODO(human)
  void raw;
  void callingCode;
  return null;
}

/** "+91 •••• ••3210": enough for her to recognise the number, not enough to read it off a screen. */
export function phoneHint(e164: string): string {
  return `${e164.slice(0, 3)} •••• ••${e164.slice(-4)}`;
}

/** WhatsApp's click-to-chat link, message pre-filled: https://wa.me/<digits>?text=… (opens the app on phones). */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}

/** The message she sends when a journey starts, in her own voice (the link is that contact's own, revocable one). */
export function journeyMessage(liveUrl: string, destination: string | null, mode?: string): string {
  const lead = destination ? `${mode === "walk" ? "I'm walking to" : "I'm on my way to"} ${destination}.` : "Here's where I am.";
  return `${lead} Follow along live on MIRA until I ${destination ? "arrive" : "stop sharing"}: ${liveUrl}`;
}

/** "Tell my people now": care wording, not SOS — she's asking them to check on her. */
export function checkOnMeMessage(liveUrl: string): string {
  return `Can you check on me? Call or message me. Here's where I am, live on MIRA: ${liveUrl}`;
}
