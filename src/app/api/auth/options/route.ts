import { json } from "@/server/http/handler";
import { demoSignInAllowed, googleSignInConfigured, smtpConfigured } from "@/server/config/env";

export const dynamic = "force-dynamic";

/** Which ways to sign in this deployment offers, so the sign-in sheet never shows one that can't work. */
export function GET() {
  return json({ google: googleSignInConfigured(), email: smtpConfigured(), demo: demoSignInAllowed() });
}
