"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { CommunityNote } from "@/server/notes";
import { Icon } from "@/components/ui/Icon";

type Result = { key: string; notes: CommunityNote[]; failed: boolean };

/** Only public, thresholded releases enter this surface. A lack of releases is never a safety verdict. */
export function CommunityPulse({ point, compact = false }: { point: { lat: number; lon: number } | null; compact?: boolean }) {
  const key = point ? `${point.lat.toFixed(2)},${point.lon.toFixed(2)}` : "";
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (!point) return;
    let live = true;
    void api<{ notes: CommunityNote[] }>("/api/community/nearby", { body: { lat: point.lat, lon: point.lon } }).then((r) => {
      if (live) setResult({ key, notes: r.ok ? r.data.notes : [], failed: !r.ok });
    });
    return () => { live = false; };
    // Key is rounded to keep a small position change from refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = result?.key === key ? result : null;
  const notes = current?.notes ?? [];
  return (
    <section aria-labelledby="community-pulse-title" className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Icon name="community" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="community-pulse-title" className="text-lg font-semibold">Local pulse</h2>
          <p className="text-sm text-ink-muted">What people have helped confirm nearby</p>
        </div>
      </div>
      {!point ? <p className="mt-4 text-sm text-ink-muted">Choose your area to see local notes.</p>
        : !current ? <p role="status" className="mt-4 text-sm text-ink-muted">Checking local notes…</p>
        : current.failed ? <p role="status" className="mt-4 text-sm text-ink-muted">Couldn&apos;t check community notes now.</p>
        : notes.length ? (
          <div className="mt-4 space-y-2">
            {notes.slice(0, compact ? 2 : 5).map((n) => <div key={n.id} className="rounded-[var(--radius-control)] bg-sunken px-4 py-3">
              <p className="text-sm font-medium">{n.text}</p>
              <p className="mt-1 text-xs text-ink-subtle">Community summary · {n.week} · {n.timeBand}</p>
            </div>)}
            <p className="text-xs text-ink-subtle">Summaries appear only after enough independent evidence. They can change.</p>
          </div>
        ) : compact ? <p className="mt-3 text-sm text-ink-muted">No confirmed note here yet. That doesn&apos;t mean it&apos;s safe.</p>
        : <div className="mt-4 rounded-[var(--radius-control)] bg-sunken px-4 py-3">
          <p className="text-sm font-medium">Local notes are still growing.</p>
          <p className="mt-1 text-xs text-ink-muted">No confirmed note does not mean a place is safe.</p>
        </div>}
      {compact ? <Link href="/around" className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-accent-strong">Explore around you <Icon name="arrow" className="size-4" /></Link> : null}
    </section>
  );
}
