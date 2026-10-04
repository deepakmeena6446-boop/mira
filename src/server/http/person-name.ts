import { z } from "zod";

/**
 * The text layer every user-chosen label goes through before it can sit inside MIRA's own sentences
 * (emails, the follower page, the inbox). Audit P17-001: bidi overrides reversed Mira's copy, zero-width
 * and filler characters made invisible names, and U+2028/NEL/TAB slipped past the "no line breaks" rule.
 * NFKC folds look-alikes (fullwidth "．", "ｍｉｒａ") into what the checks below look for. ZWJ/ZWNJ stay:
 * Indic and Persian names need them, and on their own they're refused (no letter) anyway.
 */
export function cleanLabel(v: string): string {
  return v
    .normalize("NFKC")
    .replace(/(?![‌‍])[\p{Cf}ᅟᅠㅤﾠ⠀]/gu, "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\p{Zs}]+/gu, " ")
    .trim();
}

/** Anything a mail client could turn into a link: a scheme, www., an address, or a domain shape of any TLD (P17-002: "mirahelp.co"). */
const LINKISH = /(https?:|www\.|:\/\/|@|[\p{L}\p{N}-]{2,}[.。][a-z]{2,24}(?![\p{L}\p{N}]))/iu;

/** Words that, making up a whole name or standing next to "MIRA", read as MIRA itself or an authority (P17-002). */
const ROLES = new Set([
  "account", "admin", "administrator", "alert", "alerts", "ambulance", "app", "bot", "emergency", "fire", "help", "helpdesk", "helpline", "login",
  "moderator", "no-reply", "noreply", "notification", "notifications", "official", "password", "police", "safety", "security", "service",
  "services", "sos", "staff", "support", "system", "team", "urgent", "verification", "verify",
]);
const FILLER = new Set(["a", "and", "at", "from", "of", "the"]);

/** "Emergency", "Admin", "Support team" (only role words); "MIRA team", "Asha from Mira support" (MIRA plus a role); "MIRA" in capitals. "Mira" alone is a real name. */
export function impersonates(name: string): boolean {
  if (name === "MIRA") return true;
  const words = name.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w && !FILLER.has(w));
  if (words.includes("mira") && words.some((w) => ROLES.has(w))) return true;
  return words.length > 0 && words.every((w) => ROLES.has(w));
}

/**
 * A person's display name. It appears inside emails MIRA sends to other people, so it can't carry links,
 * email addresses, markup, line breaks or invisible/bidi characters, must have a visible letter, and
 * can't pass as MIRA or an emergency service (no phishing via names).
 */
export const personName = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform(cleanLabel)
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        .refine((v) => /\p{L}/u.test(v), "Names need at least one letter.")
        .refine((v) => !LINKISH.test(v) && !/[<>{}\\]/.test(v), "Names can't contain links, email addresses or symbols like < >.")
        .refine((v) => !impersonates(v), "Choose a name that doesn't look like MIRA or an emergency service."),
    );

/**
 * A place name she chose (it comes from a map provider, a saved label or a dropped pin) that is
 * repeated in emails to her contacts. Never refused — a trip must always start — but defused:
 * no markup, line breaks, bidi/invisible characters or anything a mail client would turn into a link.
 * Used on start AND on a destination change (audit P19-002: the change skipped it).
 */
export const placeLabel = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((v) =>
      cleanLabel(v)
        .replace(/[<>{}\\]/g, " ")
        .replace(/(https?:\/\/|www\.)/gi, "")
        .replace(/\.(?=(com|net|org|in|io|ly|me|xyz|link|app|co|site|online|info|biz|top|click)\b)/gi, " .")
        .replace(/\s+/g, " ")
        .trim() || "Destination",
    );
