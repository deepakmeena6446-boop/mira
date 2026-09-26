"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { isNight } from "@/domain/help-points";

/**
 * The one factual question after a journey (blueprint §9 "Arrival"): chosen by relevance, or
 * nothing. Today that's "Was the way lit?" after a walk in the dark, when this phone still has
 * the route. The single slot on the trip screen's arrival view — extend it here (e.g. MIRA
 * Checks), not in TripScreen.
 */
export function AfterArrival({
  trip,
  route,
  hour,
  onDone,
}: {
  trip: { id: string; state: string; mode: string; autoArrival: boolean };
  /** The route line kept on this device for the journey (never stored by MIRA's server). */
  route: Array<[number, number]> | null;
  /** Her local hour now, or null before the clock is known (renders nothing on the server). */
  hour: number | null;
  /** Called once she has answered, so the device can forget the route. */
  onDone: () => void;
}) {
  if (hour === null) return null;
  const walked = trip.mode === "walk" && trip.autoArrival;
  const finished = trip.state === "arrived" || trip.state === "ended";
  if (walked && finished && route !== null && route.length > 2 && isNight(hour)) return <LitQuestion route={route} onDone={onDone} />;
  return null;
}

/** "Was the way lit?" — the walked route is turned into anonymous street cells on the server and discarded. */
function LitQuestion({ route, onDone }: { route: Array<[number, number]>; onDone: () => void }) {
  const [state, setState] = useState<"ask" | "sending" | "done" | "failed">("ask");
  const send = async (vote: "lit" | "partly" | "dark") => {
    setState("sending");
    const r = await api("/api/lighting/vote", { body: { route, vote } });
    setState(r.ok ? "done" : "failed");
    if (r.ok) onDone();
  };
  if (state === "done") return <p className="mt-6 max-w-sm rounded-3xl bg-surface px-5 py-4 text-sm text-ink-muted shadow-[var(--shadow-card)] animate-rise">Thank you 💛 That helps the next person walking here at night.</p>;
  return (
    <div className="mt-6 w-full max-w-sm rounded-3xl bg-surface p-5 text-left shadow-[var(--shadow-card)] animate-rise">
      <p className="font-bold">Was the way lit?</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([["lit", "💡 Lit"], ["partly", "🌗 Partly"], ["dark", "🌑 Not lit"]] as const).map(([v, label]) => (
          <button key={v} type="button" disabled={state === "sending"} onClick={() => send(v)} className="min-h-12 rounded-2xl bg-sunken text-sm font-bold disabled:opacity-60">
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-subtle">{state === "failed" ? "Couldn't send that — check your connection and try again." : "One tap, about the street, not about you. Saved per stretch of street, not linked to you or this journey."}</p>
    </div>
  );
}
