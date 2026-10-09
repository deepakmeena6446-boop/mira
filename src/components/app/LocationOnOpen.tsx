"use client";

import { useEffect } from "react";
import { GroupRow, Toggle } from "@/components/mira/Rows";
import { chooseLocation, currentLocation, locationUsable, rememberLocationChoice, requestLocation, useLocationChoice, watchWhileVisible } from "@/lib/location-store";

/**
 * Location, asked once (owner decision 2026-10-04). Once she allows it, every later open fetches her position and
 * keeps it fresh while Mira is on screen — so Emergency shows the right number on any screen she lands on. "Not now"
 * or a refusal in the browser prompt is remembered; she can turn it on or off any time in You. Memory only.
 * Mounted once in the app shell; it draws nothing. Nothing asks on first open (sprint 02): the choice is made
 * where it is needed — "Use my location" in Around or a plan, or this setting in You.
 */
export function LocationOnOpen() {
  const choice = useLocationChoice();
  useEffect(() => {
    if (choice !== "on") return;
    // A browser permission withdrawn in settings turns her choice off, rather than asking on every open.
    if (!locationUsable(currentLocation())) void requestLocation().then((r) => { if (r.status === "denied") rememberLocationChoice(false); });
    return watchWhileVisible();
  }, [choice]);
  return null;
}

/** You → App: the same choice, changeable any time. */
export function LocationSetting() {
  const choice = useLocationChoice();
  const on = choice === "on";
  return <GroupRow icon="locate" title="Use my location when Mira opens" detail={on ? "Emergency numbers and what’s around you stay current while Mira is open." : "Off: Mira asks only when you tap “Use my location”."} end={<Toggle on={on} label="Use my location when Mira opens" disabled={choice === "unknown"} onChange={(next) => { if (next) void chooseLocation(); else rememberLocationChoice(false); }} />} />;
}
