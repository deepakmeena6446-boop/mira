import { formatIstDateTime } from "@/lib/time";

/**
 * Minimised contact emails (architecture §6): ETA and a public place name only if the
 * traveller picked one from the map; never origin, route, live location or address.
 */
export function inviteEmail(args: { acceptUrl: string; etaAt: Date; expiresAt: Date }) {
  return {
    subject: "MIRA: you've been asked to be a check-in contact",
    text: [
      "Hello,",
      "",
      "Someone who has your email address asked MIRA to email you once if they miss a planned check-in for one journey.",
      `Their planned arrival time is ${formatIstDateTime(args.etaAt)}.`,
      "",
      "Nothing will be sent to you unless you accept. To accept, open:",
      args.acceptUrl,
      "",
      `This link works only for this one journey and stops working when it ends (at the latest ${formatIstDateTime(args.expiresAt)}).`,
      "Anyone with this link can accept it, so please don't forward it.",
      "",
      "MIRA never shares anyone's location, map or route, and it is not an emergency service.",
      "If you don't know why you received this, you can ignore it.",
    ].join("\n"),
  };
}

export function missedAlertEmail(args: { etaAt: Date; placeName: string | null }) {
  return {
    subject: "MIRA: a planned check-in was missed",
    text: [
      "Hello,",
      "",
      "The person who asked you to be their MIRA check-in contact did not confirm that they arrived.",
      `Planned arrival: ${formatIstDateTime(args.etaAt)}`,
      `Destination: ${args.placeName ?? "planned destination"}`,
      "",
      "MIRA does not know or track their location. This is not an emergency alert, and nobody else has been notified.",
      "They may simply have forgotten to check in. You might want to contact them directly.",
      "",
      "You received this one email because you accepted an invitation for this journey. You won't receive further emails about it.",
    ].join("\n"),
  };
}
