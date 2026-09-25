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
