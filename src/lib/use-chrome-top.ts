"use client";

import { useEffect, type RefObject } from "react";

/**
 * Publishes the bottom edge of a screen's top chrome (greeting/journey header + help anchors) as
 * `--chrome-top` on <html>, so the bottom sheet's full detent stops below it (docs/launch-ux/02 C-10.2).
 */
export function useChromeTop(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--chrome-top", `${Math.ceil(el.getBoundingClientRect().bottom + 8)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
      root.style.removeProperty("--chrome-top");
    };
  }, [ref]);
}
