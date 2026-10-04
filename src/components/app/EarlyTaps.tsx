"use client";

import { useEffect } from "react";
import { chooseLocation } from "@/lib/location-store";
import type { EarlyTap } from "@/domain/early-taps";

type EarlyWindow = Window & { __miraEarly?: { taps: EarlyTap[]; text: Record<string, string> }; __miraReady?: boolean };

/**
 * Replays taps made before the app was ready (domain/early-taps, audit P09-004). "I feel unsafe" and Emergency both
 * open the support sheet — the one with the big call button — since a dial can't be replayed after the fact.
 */
export function EarlyTaps() {
  useEffect(() => {
    const w = window as EarlyWindow;
    w.__miraReady = true;
    const taps = w.__miraEarly?.taps.splice(0) ?? [];
    if (!taps.length) return;
    // After every screen's effects: the sheet's listener is attached by then.
    const t = window.setTimeout(() => {
      if (taps.includes("unsafe") || taps.includes("emergency")) window.dispatchEvent(new Event("mira:need-options"));
      if (taps.includes("locate")) void chooseLocation();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
