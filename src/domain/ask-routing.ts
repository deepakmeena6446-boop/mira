import { DANGER } from "./urgent-intent";

/** These actions never wait for account, network, quota or model work. */
export function immediateSupportIntent(message: string): "urgent" | "unease" | null {
  if (/\b(?:sos)\b/i.test(message)) return "urgent";
  if (DANGER.test(message)) return "urgent";
  if (/\b(?:feel(?:ing)?\s+(?:unsafe|uneasy|uncomfortable)|(?:i(?:'m| am)?\s+)?uneasy|not\s+(?:feeling\s+)?comfortable|something feels wrong|need\s+(?:support|options)\s+(?:now|right now))\b/i.test(message)) return "unease";
  return null;
}

export type AskToolIntent = "emergency_info" | "nearby" | "report" | "product";

/** Explicit information/tool questions take precedence over a tab's movement plan. */
export function askToolIntent(message: string): AskToolIntent | null {
  if (/\b(?:emergency|police|ambulance|fire)\s+(?:number|phone|helpline)|\b(?:what|which)\s+(?:emergency\s+)?number\s+(?:do\s+i\s+dial|to\s+call|in\b|for\b)|\bwhat\s+do\s+i\s+dial\b/i.test(message)) return "emergency_info";
  if (/^\s*(?:what\s+(?:can|could)\s+(?:you|u|mira)\s+(?:do|help(?:\s+me)?\s+with)|what\s+(?:you|u|mira)\s+can\s+help\s+me\s+with|how\s+can\s+(?:you|u|mira)\s+help(?:\s+me)?|what\s+(?:do|does)\s+(?:you|mira)\s+do|what\s+are\s+your\s+capabilities|who\s+are\s+you|tell\s+me\s+about\s+yourself|how\s+does\s+mira\s+work)\s*[?!.]*\s*$/i.test(message)) return "product";
  if (/\b(?:report\s+(?:a\s+|an\s+|the\s+)?(?:problem|incident|harassment|streetlight|street\s+light|broken|pothole)|how\s+(?:do|can)\s+i\s+report|broken\s+street\s*light)\b/i.test(message)) return "report";
  if (/\b(?:what(?:'s|\s+is)\s+open\s+nearby|find\s+(?:help\s+points?|places?|pharmac(?:y|ies))\s+nearby|nearby\s+(?:places?|help\s+points?)|(?:pharmacy|hospital|police|hotel|station|fuel|store)s?\s+near\s+me|save\s+my\s+home)\b/i.test(message)) return "nearby";
  return null;
}

/** Existing nearby, reporting and product-help tools remain on the companion path for accounts. */
export function askUsesPlan(message: string, _hasPlan: boolean, signedIn: boolean): boolean {
  if (immediateSupportIntent(message)) return true;
  const tool = askToolIntent(message);
  if (tool === "emergency_info") return true; // reviewed facts, ephemeral, never the movement reply
  if (tool) return !signedIn;
  return true;
}

/** Generic product or urgent questions never seed a movement draft. */
export function shouldSeedPlan(message: string): boolean {
  return !immediateSupportIntent(message) && !askToolIntent(message) && /\b(?:plan\w*|go|going|walk\w*|run\w*|loop|travel\w*|trip|route|commut\w*|home|arriv\w*|land\w*|airport|station|hotel|return\w*|venue|event|date|dinner|appointment|meeting|from .+ to )\b/i.test(message);
}
