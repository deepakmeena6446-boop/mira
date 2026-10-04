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
  // Only what people type in a number: digits, one leading "+", spaces, brackets, dashes, dots, slashes.
  // Anything else (letters, "call me") is refused rather than guessed: a wrong number opens a stranger's chat.
  const typed = raw.trim();
  if (!typed || /[^\d\s+()\-./]/.test(typed)) return null;
  // "+44 (0)20 …": the bracketed trunk 0 is a local habit written inside an international number.
  let rest = typed.replace(/\(0\)/g, "");
  let international = rest.startsWith("+");
  if (international) rest = rest.slice(1);
  if (rest.includes("+")) return null;
  let digits = rest.replace(/[\s()\-./]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  // "00" is the international prefix in most of the world: 0091 98765 43210 = +91 98765 43210.
  if (!international && digits.startsWith("00")) {
    international = true;
    digits = digits.slice(2);
  }
  const cc = callingCode?.replace(/\D/g, "") ?? null;
  if (international) return checked(withoutTrunkOrRepeat(digits, cc));
  // A local number needs her country's code; without it, a guess could reach someone else.
  if (!cc) return null;
  // "919876543210" typed without "+": her own country code already leads a full number.
  const length = NATIONAL_LENGTH[cc];
  if (length && digits.startsWith(cc) && digits.length === cc.length + length) return checked(digits);
  // The national trunk 0 (098765…, 020 7946…) is dropped once the country code is added. WhatsApp numbers are
  // mobiles, so countries that keep a 0 after the code (Italian landlines) don't arise in practice.
  return checked(`${cc}${digits.replace(/^0/, "")}`);
}

/**
 * National number length (after the country code) where it is fixed, for the codes people here use most.
 * A number of another length in these countries is refused, not guessed (audit P07-002 / P07-007).
 */
const NATIONAL_LENGTH: Record<string, number> = { "91": 10, "1": 10, "44": 10, "81": 10, "254": 9, "351": 9, "971": 9, "880": 10, "92": 10, "977": 10, "94": 9 };
function countryCodeOf(digits: string): string | null {
  for (const n of [1, 2, 3]) if (NATIONAL_LENGTH[digits.slice(0, n)]) return digits.slice(0, n);
  return null;
}
/** "+91 098765 43210" → +919876543210 (a trunk 0 after the code); "+91 91 98765 43210" → the code typed twice. */
function withoutTrunkOrRepeat(digits: string, home: string | null): string {
  const cc = countryCodeOf(digits) ?? (home && digits.startsWith(home) ? home : null);
  if (!cc || cc === "39") return digits; // Italy keeps its 0 after the code
  let national = digits.slice(cc.length);
  const length = NATIONAL_LENGTH[cc];
  if (national.startsWith("0") && (!length || national.length === length + 1)) national = national.slice(1);
  if (length && national.length === length + cc.length && national.startsWith(cc)) national = national.slice(cc.length);
  return `${cc}${national}`;
}
function checked(digits: string): string | null {
  const cc = countryCodeOf(digits);
  if (cc && digits.length - cc.length !== NATIONAL_LENGTH[cc]) return null;
  return E164.test(`+${digits}`) ? `+${digits}` : null;
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
