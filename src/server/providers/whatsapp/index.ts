import "server-only";

/**
 * WhatsApp delivery (docs/phase4/00 §3). Today Mira opens WhatsApp with the live link and the person
 * presses Send ("tap_to_send"): Mira never claims a message was delivered. Automatic sending needs the
 * WhatsApp Business Platform — a verified business, an approved message template and a phone number
 * id — which this environment doesn't have. This is the seam where that adapter plugs in.
 *
 * PLACEHOLDER: `businessApiSender()` returns null until a real adapter is written AND configured.
 * When it exists, the journey start and missed-check-in paths call `sender.sendLiveLink` and record
 * "accepted by WhatsApp" — never "delivered" or "read" — exactly like email receipts today.
 */
export type WhatsAppMode = "tap_to_send" | "business_api";

export interface WhatsAppSender {
  /** Send an approved template with the live link. Resolves with the provider's acceptance only. */
  sendLiveLink(input: { toE164: string; firstName: string; travellerName: string; url: string }): Promise<{ accepted: boolean; providerId: string | null }>;
}

/** No adapter is implemented yet; flip only together with a tested adapter (see providers/modes.ts). */
const ADAPTER_IMPLEMENTED = false;

export function whatsappMode(env: NodeJS.ProcessEnv = process.env): WhatsAppMode {
  return ADAPTER_IMPLEMENTED && env.WHATSAPP_BUSINESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TEMPLATE_LIVE_LINK ? "business_api" : "tap_to_send";
}

export function businessApiSender(): WhatsAppSender | null {
  return whatsappMode() === "business_api" ? null /* adapter goes here */ : null;
}
