"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { isNight } from "@/domain/help-points";
import { CheckCard } from "@/components/app/CheckCard";
import type { CheckView } from "@/server/contributions/checks";

/**
 * The one factual question after a journey (blueprint §9 "Arrival"): chosen by relevance, or
 * nothing: "Was the way lit?" after a walk in the dark (when this phone still has the route), else
 * the Mira Check the server prepared from places this journey actually passed. At most one.
 */
export function AfterArrival({
  trip,
  route,
  hour,
  onDone,
}: {
  trip: { id: string; state: string; mode: string; autoArrival: boolean };
  /** The route line kept on this device for the journey (never stored by Mira's server). */
  route: Array<[number, number]> | null;
  /** Her local hour now, or null before the clock is known (renders nothing on the server). */
  hour: number | null;
  /** Called once she has answered, so the device can forget the route. */
  onDone: () => void;
}) {
  const walked = trip.mode === "walk" && trip.autoArrival;
  const finished = trip.state === "arrived" || trip.state === "ended";
  const lit = hour !== null && walked && finished && route !== null && route.length > 2 && isNight(hour);
  const preparation = useJourneyCheck(trip.id, finished && !lit);
  if (!finished) return null;
  // Only an arrival is "arrived" — not a journey ended early or sharing she stopped (the headline above already names those).
  const done = trip.state === "arrived" && trip.autoArrival ? "You've arrived" : "All done";
  if (hour === null) return <p className="mt-6 text-sm text-ink-muted">{done}. Checking whether Mira has one quick question…</p>;
  if (lit) return <LitQuestion route={route!} onDone={onDone} />;
  if (preparation.check) return <div className="mt-6 w-full max-w-sm text-left animate-rise"><CheckCard check={preparation.check} /></div>;
  return <div role="status" className="mt-6 w-full max-w-sm rounded-[var(--radius-card)] bg-surface px-5 py-4 text-sm text-ink-muted shadow-[var(--shadow-card)]">
    <p className="font-bold text-ink">{done} ✓</p>
    <p className="mt-1">{preparation.state === "none" ? "Nothing needed from you this time." : preparation.state === "later" ? "A question may still become available. You can check later in Contribute." : "Mira may have one quick question about this journey. Preparing…"}</p>
    {preparation.state === "later" ? <Link href="/contribute" className="mt-2 inline-flex min-h-11 items-center font-bold text-accent">Open Contribute</Link> : null}
  </div>;
}

/** Bounded attempts: a transient provider error can resolve while the arrival view is open. */
export const CHECK_RETRY_DELAYS_MS = [0, 1500, 2500, 4000, 6000] as const;
type JourneyCheckState = { state: "preparing" | "none" | "later"; check: Pick<CheckView, "id" | "question" | "options"> | null };

function useJourneyCheck(journeyId: string, want: boolean): JourneyCheckState {
  const [result, setResult] = useState<JourneyCheckState>({ state: "preparing", check: null });
  useEffect(() => {
    if (!want) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async (attempt: number) => {
      const r = await api<{ checks: Array<CheckView & { journeyId: string | null }>; journeyCheck: "ready" | "pending" | "none" | "failed" }>(`/api/contribute?journeyId=${encodeURIComponent(journeyId)}`);
      if (stop) return;
      const check = r.ok ? r.data.checks.find((x) => x.journeyId === journeyId && new Date(x.expiresAt).getTime() > Date.now()) : null;
      if (check) { setResult({ state: "preparing", check }); return; }
      if (r.ok && r.data.journeyCheck === "none") { setResult({ state: "none", check: null }); return; }
      if (attempt >= CHECK_RETRY_DELAYS_MS.length - 1) { setResult({ state: "later", check: null }); return; }
      timer = setTimeout(() => void load(attempt + 1), CHECK_RETRY_DELAYS_MS[attempt + 1]);
    };
    void load(0);
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [journeyId, want]);
  return result;
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
  if (state === "done") return <p className="mt-6 max-w-sm rounded-[var(--radius-card)] bg-surface px-5 py-4 text-sm text-ink-muted shadow-[var(--shadow-card)] animate-rise">Thank you 💛 That helps the next person walking here at night.</p>;
  return (
    <div className="mt-6 w-full max-w-sm rounded-[var(--radius-card)] bg-surface p-5 text-left shadow-[var(--shadow-card)] animate-rise">
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
