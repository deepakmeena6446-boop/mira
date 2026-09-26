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

/*
 * MIRA 2.0 trip emails. The app is worldwide and we don't know the contact's timezone,
 * so times are relative ("in about 18 minutes") rather than clock times. Only the owner's
 * first name, the destination label they chose, and the live link — never coordinates.
 */
const about = (min: number) => (min <= 1 ? "a minute" : `about ${min} minutes`);

/** How the journey is described to contacts ("is walking to", "is on the way to"). */
export function journeyVerb(mode: string | undefined): string {
  return mode === "ride" ? "is on the way by auto or cab to" : mode === "transit" ? "is on the way by metro or bus to" : mode === "other" ? "is on the way to" : "is walking to";
}

export function tripSharedEmail(args: { contactName: string; ownerName: string; destination: string; minutesToEta: number; liveUrl: string; mode?: string }) {
  return {
    subject: `${args.ownerName} is sharing a trip with you`,
    text: [
      `Hi ${args.contactName},`,
      "",
      `${args.ownerName} ${journeyVerb(args.mode)} ${args.destination} and shared the trip with you on MIRA.`,
      `They expect to arrive in ${about(args.minutesToEta)}. Follow along live until they arrive:`,
      args.liveUrl,
      "",
      "The link stops working once the trip ends. MIRA will email you once if they don't check in.",
    ].join("\n"),
  };
}

export function tripMissedEmail(args: { ownerName: string; destination: string; minutesLate: number; liveUrl: string | null }) {
  return {
    subject: `${args.ownerName} missed their check-in on MIRA`,
    text: [
      "Hello,",
      "",
      `${args.ownerName} was expected at ${args.destination} ${about(args.minutesLate)} ago and hasn't confirmed they arrived.`,
      ...(args.liveUrl ? ["Their last shared location is here while the trip is still open:", args.liveUrl] : []),
      "",
      "They may simply have forgotten to tap \"I'm here\". You might want to call or message them directly.",
      "MIRA is not an emergency service and hasn't contacted anyone else. If you believe they're in danger, call your local emergency number.",
      "",
      "This is the only alert you'll get for this trip.",
    ].join("\n"),
  };
}

/** Follow-up to a missed-arrival email: the person has checked in. No location, no link. */
export function tripArrivedEmail(args: { ownerName: string; destination: string }) {
  return {
    subject: `${args.ownerName} has checked in on MIRA`,
    text: [
      "Hello,",
      "",
      `Good news: ${args.ownerName} has now checked in at ${args.destination}.`,
      "Their trip is closed and live sharing has stopped.",
      "",
      "You don't need to do anything. This is the last email about this trip.",
    ].join("\n"),
  };
}

/**
 * "Tell my people now": she asked her trusted contacts to check on her. Care wording, not an
 * SOS: a false tap should cost little, and MIRA never implies anyone else was contacted.
 */
export function checkOnMeEmail(args: { ownerName: string; liveUrl: string | null }) {
  return {
    subject: `${args.ownerName} asked you to check on them`,
    text: [
      "Hello,",
      "",
      `${args.ownerName} tapped "Tell my people now" on MIRA and asked you to check on them.`,
      ...(args.liveUrl ? ["See where they are right now (the link works while they're sharing):", args.liveUrl] : []),
      "",
      "The best next step is usually to call or message them.",
      "MIRA is not an emergency service and hasn't contacted anyone else. If you believe they're in danger, call your local emergency number.",
    ].join("\n"),
  };
}

export function signInLinkEmail(args: { url: string; adding: boolean }) {
  return {
    subject: "Your MIRA sign-in link",
    text: [
      "Hello,",
      "",
      args.adding ? "Open this link to add this email to your MIRA account, so you can sign in on another phone:" : "Open this link to sign in to MIRA:",
      args.url,
      "",
      "It works once, for 20 minutes. If you didn't ask for it, ignore this email — nothing changes.",
    ].join("\n"),
  };
}

export function unknownAccountEmail() {
  return {
    subject: "Signing in to MIRA",
    text: [
      "Hello,",
      "",
      "Someone asked to sign in to MIRA with this email address, but no MIRA account uses it yet.",
      "To keep an account, open MIRA, start with your first name, then add this email in Me.",
      "",
      "If this wasn't you, ignore this email.",
    ].join("\n"),
  };
}
