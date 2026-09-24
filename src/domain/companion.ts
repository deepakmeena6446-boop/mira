/**
 * "Stay with me" companion experiment boundary (execution plan Phase 8, product spec §2).
 *
 * V0 decision: NOT SHIPPED. A genuinely usable in-app conversation would need a
 * conversational provider (none configured, and no privacy review of one exists), and
 * browser speech cannot be verified as on-device. A scripted chat would imply presence
 * that isn't there. So no route, control or copy exposes it; this module is the single
 * switch a future, verified implementation would plug into.
 *
 * Hard limits for any future implementation: explicit start/stop, short-lived, no
 * transcript or audio retention, labelled as an experiment, and never claiming
 * protection, monitoring, emergency response or a human listening. No phone calls.
 */
export interface CompanionAvailability {
  available: false;
  reason: "not_verified";
}

export function companionAvailability(): CompanionAvailability {
  return { available: false, reason: "not_verified" };
}

/** Interface a future verified implementation must satisfy (kept independent of journeys and reporting). */
export interface CompanionSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(text: string): Promise<string>;
  readonly retainsTranscript: false;
}
