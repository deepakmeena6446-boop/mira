"use client";

import { useEffect, useRef } from "react";

/**
 * Phone-friendly overlay behaviour for sheets and full-screen panels:
 * - the system back gesture/button closes the overlay instead of leaving the screen,
 * - Escape closes it (keyboards, desktop),
 * - focus goes back to whatever opened it.
 */
export function useOverlay(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A same-URL history entry that "back" can pop. Merge into the router's own state so
    // Next.js keeps working normally.
    window.history.pushState({ ...(window.history.state ?? {}), miraOverlay: true }, "");
    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      // Closed from the UI (not via back): drop our entry — unless we've already navigated away.
      if (!poppedByBack && window.history.state?.miraOverlay) window.history.back();
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);
}
