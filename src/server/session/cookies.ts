import "server-only";
import { isProduction } from "@/server/config/env";

/** Cookie names use the __Host- prefix in production (Secure, Path=/, no Domain). */
export function cookieName(base: "actor" | "admin" | "invite" | "google"): string {
  return isProduction() ? `__Host-mira_${base}` : `mira_${base}`;
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
