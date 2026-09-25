"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import type { SavedPlace } from "@/server/account/places";
import { kindEmoji } from "./kinds";

export interface Destination {
  name: string;
  lat: number;
  lon: number;
  kind?: string;
}

interface Hit {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distanceM?: number;
}

function fmtDistance(m?: number) {
  if (m === undefined) return "";
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Full-screen "Where to?" search: saved places first, then place results, or drop a pin. */
export function SearchOverlay({
  open,
  onClose,
  onPick,
  onDropPin,
  saved,
  near,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (d: Destination) => void;
  onDropPin: () => void;
  saved: SavedPlace[];
  near: { lat: number; lon: number } | null;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const qs = new URLSearchParams({ q: term, ...(near ? { lat: String(near.lat), lon: String(near.lon) } : {}) });
      try {
        const res = await api<{ places: Hit[] }>(`/api/geo/search?${qs}`, { signal: ctrl.signal });
        if (res.ok) setHits(res.data.places);
      } catch {
        /* aborted */
      }
      setLoading(false);
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, near]);

  if (!open) return null;
  const term = q.trim().toLowerCase();
  const savedHits = saved.filter((s) => !term || s.label.toLowerCase().includes(term));
  const showHits = term.length >= 2;

  return (
    <div role="dialog" aria-modal="true" aria-label="Where to?" className="bg-companion fixed inset-0 z-50 flex flex-col animate-fade">
      <div className="flex items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close search" className="grid size-12 shrink-0 place-items-center rounded-full bg-surface shadow-[var(--shadow-card)]">
          <Icon name="back" />
        </button>
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-full bg-surface px-4 shadow-[var(--shadow-card)] focus-within:ring-2 focus-within:ring-accent">
          <Icon name="know" className="size-5 text-ink-subtle" />
          <span className="sr-only">Search for a place</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where to?" className="w-full bg-transparent text-lg outline-none" autoComplete="off" />
        </label>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto px-4 pb-10">
        {savedHits.length ? (
          <section aria-label="Saved places" className="mb-4">
            <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-ink-subtle">Your places</h2>
            <ul className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
              {savedHits.map((s) => (
                <li key={s.id} className="border-b border-line last:border-0">
                  <button type="button" onClick={() => onPick({ name: s.label, lat: s.lat, lon: s.lon })} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                    <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-xl">{s.emoji}</span>
                    <span className="min-w-0">
                      <span className="block font-bold">{s.label}</span>
                      {s.address ? <span className="block truncate text-sm text-ink-muted">{s.address}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {showHits ? (
          <section aria-label="Places" aria-busy={loading}>
            <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-ink-subtle">Places</h2>
            {hits.length ? (
              <ul className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
                {hits.map((h) => (
                  <li key={h.id} className="border-b border-line last:border-0">
                    <button type="button" onClick={() => onPick({ name: h.name, lat: h.lat, lon: h.lon, kind: h.kind })} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                      <span className="grid size-10 place-items-center rounded-2xl bg-sunken text-xl">{kindEmoji(h.kind)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-mixed">{h.name}</span>
                        <span className="block text-sm text-ink-muted">{h.kind}</span>
                      </span>
                      <span className="text-sm text-ink-subtle">{fmtDistance(h.distanceM)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-3xl bg-surface p-5 text-ink-muted shadow-[var(--shadow-card)]">
                {loading ? "Looking…" : "No matches in the map data I have yet. You can drop a pin instead."}
              </p>
            )}
          </section>
        ) : null}
        <button
          type="button"
          onClick={onDropPin}
          className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-3xl bg-surface px-4 py-3 text-left font-bold shadow-[var(--shadow-card)] hover:bg-sunken"
        >
          <span className="grid size-10 place-items-center rounded-2xl bg-peach-soft text-xl">📍</span>
          Choose a spot on the map
        </button>
      </div>
    </div>
  );
}
