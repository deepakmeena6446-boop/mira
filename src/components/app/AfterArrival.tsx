"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { isNight } from "@/domain/help-points";
import { CheckCard } from "@/components/app/CheckCard";
import type { CheckView } from "@/server/contributions/checks";

/**
 * The one factual question after a journey (blueprint §9 "Arrival"): chosen by relevance, or
 * nothing: "Was the way lit?" after a walk in the dark (when this phone still has the route), else
 * the MIRA Check the server prepared from places this journey actually passed. At most one.
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
  const walked = trip.mode === "walk" && trip.autoArrival;
  const finished = trip.state === "arrived" || trip.state === "ended";
  const lit = hour !== null && walked && finished && route !== null && route.length > 2 && isNight(hour);
  const check = useJourneyCheck(trip.id, trip.state === "arrived" && !lit);
  if (hour === null) return null;
  if (lit) return <LitQuestion route={route!} onDone={onDone} />;
  if (check) return <div className="mt-6 w-full max-w-sm text-left animate-rise"><CheckCard check={check} /></div>;
  return null;
}

/** The MIRA Check for this journey, if the server prepared one (it may take a moment after arrival). */
function useJourneyCheck(journeyId: string, want: boolean): Pick<CheckView, "id" | "question" | "options"> | null {
  const [check, setCheck] = useState<Pick<CheckView, "id" | "question" | "options"> | null>(null);
  useEffect(() => {
    if (!want) return;
    let stop = false;
    const load = async (retry: boolean) => {
      const r = await api<{ checks: Array<CheckView & { journeyId: string | null }> }>("/api/contribute");
      if (stop || !r.ok) return;
      const c = r.data.checks.find((x) => x.journeyId === journeyId);
      if (c) setCheck(c);
      else if (retry) setTimeout(() => void load(false), 2500);
    };
    void load(true);
    return () => {
      stop = true;
    };
  }, [journeyId, want]);
  return check;
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
      <p className="mt-2 text-xs text-ink-subtle">{state === "failed" ? "Couldn't send that — check your connection and try again." : "One tap, about the street, not about you. Saved per stretch of street, not linked to this journey; your account keeps a private, encrypted note until someone else confirms it."}</p>
    </div>
  );
}
