import { shouldSeedPlan } from "@/domain/ask-routing";
import type { MiraCard } from "./types";

/**
 * Cards kept in history carry nothing about where the person was or is going: nearby-place and Help Point lists
 * (coordinates + distances from them) and trip cards (a destination's coordinates) stay on screen only.
 */
export function storableCard(card: MiraCard): MiraCard | null {
  if (card.type === "places" || card.type === "help_points" || card.type === "trip") return null;
  return card;
}

/**
 * Whether a signed-in turn may be kept in chat history (sprint mira-companion-48h 03 §E). Decided on the server
 * from the request itself — never from whether the client's plan state had updated before it posted: a turn with
 * a plan, a movement sentence (even the first one, sent with `plan: null`), the device's location, or the
 * ephemeral flag is not stored. Turns kept before this rule are untouched (no bulk deletion is authorised).
 */
export function keepTurn(input: { signedIn: boolean; message: string; plan: unknown; location: unknown; ephemeral?: boolean }): boolean {
  return input.signedIn && !input.plan && !input.location && !input.ephemeral && !shouldSeedPlan(input.message);
}
