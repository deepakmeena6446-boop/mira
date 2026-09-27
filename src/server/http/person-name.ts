import { z } from "zod";

/**
 * A person's display name. It appears inside emails MIRA sends to other people, so it
 * can't carry links, email addresses, markup or line breaks (no phishing via names).
 */
export const personName = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/(https?:|www\.|:\/\/|@|[<>{}\\]|[\r\n]|\.(com|net|org|in|io|ly|me|xyz|link|app)\b)/i.test(v), "Names can't contain links, email addresses or symbols like < >.");

/**
 * A place name she chose (it comes from a map provider, a saved label or a dropped pin) that is
 * repeated in emails to her contacts. Never refused — a trip must always start — but defused:
 * no markup, line breaks or anything a mail client would turn into a link.
 */
export const placeLabel = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((v) =>
      v
        .replace(/[<>{}\\\r\n]/g, " ")
        .replace(/(https?:\/\/|www\.)/gi, "")
        .replace(/\.(?=(com|net|org|in|io|ly|me|xyz|link|app)\b)/gi, " .")
        .replace(/\s+/g, " ")
        .trim() || "Destination",
    );
