"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { GroupRow, Toggle } from "@/components/mira/Rows";
import { chooseLocation, currentLocation, locationUsable, rememberLocationChoice, requestLocation, useLocationChoice, watchWhileVisible } from "@/lib/location-store";

/**
 * Location, asked once (owner decision 2026-10-04). Once she allows it, every later open fetches her position and
 * keeps it fresh while Mira is on screen — so Emergency shows the right number on any screen she lands on. "Not now"
 * or a refusal in the browser prompt is remembered; she can turn it on or off any time in You. Memory only.
 * Mounted once in the app shell; it draws nothing. The question itself is LocationAsk, on Home.
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

/**
 * The one-time question, in Home's own flow. It used to float over the bottom of every screen until answered and
 * covered the message box, the plan's buttons and Home's links (e2e: every first-time click there timed out).
 */
export function LocationAsk() {
  const choice = useLocationChoice();
  const [asking, setAsking] = useState(false);
  if (choice !== null) return null;
  return (
    <div className="mt-4">
      <section aria-labelledby="loc-ask-h" className="m-card p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Icon name="locate" className="size-5" /></span>
          <div className="min-w-0">
            <h2 id="loc-ask-h" className="font-semibold">Let Mira use your location?</h2>
            <p className="mt-1 text-sm text-ink-muted">So Emergency shows the right number wherever you are, and Mira can show what&apos;s open around you. Only while Mira is open — never kept as a history.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={asking} onClick={async () => { setAsking(true); await chooseLocation(); setAsking(false); }} className="mira-primary flex-1">{asking ? "Asking your phone…" : "Allow location"}</button>
          <button type="button" disabled={asking} onClick={() => rememberLocationChoice(false)} className="min-h-12 rounded-full px-4 font-semibold text-ink-muted hover:bg-sunken">Not now</button>
        </div>
      </section>
    </div>
  );
}

/** You → App: the same choice, changeable any time. */
export function LocationSetting() {
  const choice = useLocationChoice();
  const on = choice === "on";
  return <GroupRow icon="locate" title="Use my location when Mira opens" detail={on ? "Emergency numbers and what’s around you stay current while Mira is open." : "Off: Mira asks only when you tap “Use my location”."} end={<Toggle on={on} label="Use my location when Mira opens" disabled={choice === "unknown"} onChange={(next) => { if (next) void chooseLocation(); else rememberLocationChoice(false); }} />} />;
}
