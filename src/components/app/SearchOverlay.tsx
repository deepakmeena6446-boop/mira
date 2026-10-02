"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "@/lib/use-overlay";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import type { SavedPlace } from "@/server/account/places";
import { kindIcon } from "./kinds";
import { distanceUnits, formatDistance } from "@/domain/travel-mode";
import { useCountry } from "@/lib/locale-store";

export interface Destination {
  name: string;
  lat: number;
  lon: number;
  kind?: string;
  resolutionSource?: "search" | "saved_place" | "selected_point";
}

interface Hit {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distanceM?: number;
}


/** Full-screen "Where to?" search: saved places first, then place results, or drop a pin. */
export function SearchOverlay({
  open,
  onClose,
  onPick,
  onDropPin,
  saved,
  near,
  placeholder = "Where to?",
  osmOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (d: Destination) => void;
  /** Omit to hide "Choose a spot on the map" (e.g. when there's no map on screen). */
  onDropPin?: () => void;
  placeholder?: string;
  osmOnly?: boolean;
  saved: SavedPlace[];
  near: { lat: number; lon: number } | null;
}) {
  const [q, setQ] = useState("");
  const units = distanceUnits(useCountry().iso);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useOverlay(open, onClose);

  const [failure, setFailure] = useState<string | null>(null);
  // Pressing Enter/Search runs a deeper lookup (addresses, exact names) for exactly what's typed.
  const [deepFor, setDeepFor] = useState<string | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const deep = deepFor === term;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<{ places: Hit[] }>("/api/geo/search", { body: { q: term, near: near ? { lat: near.lat, lon: near.lon } : null, deep, ...(osmOnly ? { source: "osm" } : {}) }, signal: ctrl.signal });
        if (res.ok) {
          setHits(res.data.places);
          setFailure(null);
        } else if (!ctrl.signal.aborted) {
          setHits([]);
          setFailure(res.network ? "You're offline — search needs a connection. You can still choose a spot on the map." : res.message);
        }
      } catch {
        /* aborted */
      }
      setLoading(false);
    }, deep ? 0 : 300); // as you type: wait for a pause; on Enter: right away
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, near, deepFor, osmOnly]);

  if (!open) return null;
  const term = q.trim().toLowerCase();
  const savedHits = saved.filter((s) => !term || s.label.toLowerCase().includes(term));
  const showHits = term.length >= 2;

  // Portal: above the tab bar (screens are position:fixed, their own stacking context).
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Where to?" className="bg-companion fixed inset-0 z-50 flex flex-col animate-fade">
      <div className="flex items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close search" className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface">
          <Icon name="back" />
        </button>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 2) setDeepFor(q.trim());
          }}
          className="flex min-h-12 flex-1"
        >
          <label className="flex min-h-12 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 focus-within:ring-2 focus-within:ring-accent">
            <Icon name="search" className="size-5 text-ink-subtle" />
            <span className="sr-only">Search for a place</span>
            <input autoFocus type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-12 w-full bg-transparent text-lg outline-none" autoComplete="off" />
          </label>
        </form>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto px-4 pb-10">
        {savedHits.length ? (
          <section aria-label="Saved places" className="mb-4">
            <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-subtle">Your places</h2>
            <ul className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
              {savedHits.map((s) => (
                <li key={s.id} className="border-b border-line last:border-0">
                  <button type="button" onClick={() => onPick({ name: s.label, lat: s.lat, lon: s.lon, resolutionSource: "saved_place" })} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                    <span aria-hidden className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-sunken text-lg">{s.emoji}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{s.label}</span>
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
            <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-subtle">Places</h2>
            {hits.length ? (
              <>
              <ul className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
                {hits.map((h) => (
                  <li key={h.id} className="border-b border-line last:border-0">
                    <button type="button" onClick={() => onPick({ name: h.name, lat: h.lat, lon: h.lon, kind: h.kind, resolutionSource: "search" })} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                      <span aria-hidden className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink-muted"><Icon name={kindIcon(h.kind)} className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-mixed">{h.name}</span>
                        <span className="block text-sm text-ink-muted">{h.kind}</span>
                      </span>
                      <span className="text-sm text-ink-subtle">{h.distanceM === undefined ? "" : formatDistance(h.distanceM, units)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {deepFor !== q.trim() ? <p className="mt-2 px-1 text-sm text-ink-subtle">Not here? Press Search on your keyboard to look harder — addresses work too.</p> : null}
              </>
            ) : (
              <p className="rounded-[var(--radius-card)] bg-surface p-5 text-ink-muted shadow-[var(--shadow-card)]">
                {loading
                  ? "Looking…"
                  : failure ??
                    (deepFor === q.trim()
                      ? `Couldn't find that.${onDropPin ? " Try a nearby landmark, or choose the spot on the map." : " Try a nearby landmark."}`
                      : "Nothing yet — press Search on your keyboard to look harder (addresses work too).")}
              </p>
            )}
          </section>
        ) : null}
        {onDropPin ? (
          <button
            type="button"
            onClick={onDropPin}
            className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-left font-semibold hover:bg-sunken"
          >
            <span aria-hidden className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink"><Icon name="pin" className="size-5" /></span>
            Choose a spot on the map
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
