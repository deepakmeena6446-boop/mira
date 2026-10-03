"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { UnsafeSheet } from "@/components/app/UnsafeSheet";
import { endLocalCheckIn, readLocalCheckIn } from "@/lib/local-check-in-store";
import type { LocalCheckIn } from "@/domain/local-check-in";

export function LocalCheckInScreen() {
  const [entry, setEntry] = useState<LocalCheckIn | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [unsafe, setUnsafe] = useState(false);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      setEntry(readLocalCheckIn());
      setHydrated(true);
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const remaining = entry && now !== null ? Math.max(0, Math.ceil((entry.dueAt - now) / 60_000)) : null;
  return <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-5 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.5rem,env(safe-area-inset-top))]">
    <header><h1 className="text-2xl font-semibold">Private check-in</h1><p className="mt-1 text-sm text-ink-muted">A manual timer in this browser tab. No GPS, account, route, live link or contact alert.</p></header>
    <EmergencyPill variant="block" />
    {!hydrated ? <p role="status">Loading your private timer…</p> : !entry ? <div role="status" className="rounded-[var(--radius-card)] bg-surface p-4"><p>{ended ? "You ended this check-in." : "No private check-in is active in this tab."}</p><Link href="/plan" className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent-strong">Return to plan</Link></div> : <>
      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5" aria-label="Check-in timer">
        <h2 className="font-semibold">Check in yourself</h2>
        <p role="status" aria-live="polite" className="mt-2 text-xl font-semibold">{remaining === 0 ? "Check-in time reached" : `${remaining} minutes until check-in`}</p>
        <p className="mt-2 text-sm text-ink-muted">{remaining === 0 ? "Mira has not alerted anyone. If you need help, use the direct options below." : `Due at ${new Date(entry.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Keep this screen open; browser timers and location do not run reliably when it is hidden or closed.`}</p>
        <button type="button" onClick={() => { endLocalCheckIn(); setEntry(null); setEnded(true); }} className="mt-4 min-h-12 w-full rounded-[var(--radius-button)] bg-accent px-4 font-semibold text-accent-ink">I checked in — end timer</button>
      </section>
      <button type="button" onClick={() => setUnsafe(true)} className="min-h-12 rounded-[var(--radius-button)] border border-line-strong bg-surface px-4 font-semibold">I need options</button>
      <p className="text-xs text-ink-muted">Mira cannot detect your return, verify where you are or notify anyone. The plan remains separate in this tab and this timer expires 30 minutes after its due time.</p>
    </>}
    <UnsafeSheet open={unsafe} onClose={() => setUnsafe(false)} me={null} area={null} helpPoints={[]} helpLoading={false} onGoHelpPoint={() => {}} goLabel="Show" share={null} tell={null} />
  </div>;
}
