"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * After a Google sign-in that didn't finish (cancelled, expired, or refused), the callback lands
 * on Home with `?signin=failed`. Say so once, calmly, then drop the flag from the address bar.
 * The reason is never shown (it's in the server log only).
 */
export function SignInNotice() {
  const toast = useToast();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("signin") !== "failed") return;
    toast("Signing in with Google didn't finish. You can try again, or keep looking around without an account.", "error");
    url.searchParams.delete("signin");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [toast]);
  return null;
}
