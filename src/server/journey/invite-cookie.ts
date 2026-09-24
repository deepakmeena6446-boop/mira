import "server-only";
import { isProduction } from "@/server/config/env";

/** Short-lived cookie that carries the invitation token after the clean-URL redirect. */
export const INVITE_COOKIE_MAX_AGE = 30 * 60;
export function inviteCookieName(): string {
  return isProduction() ? "__Host-mira_invite" : "mira_invite";
}
