"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { Sheet } from "@/components/mira/Frame";
import { kindIcon } from "@/components/app/kinds";
import { api } from "@/lib/api-client";
import { freshLocation, locationUsable } from "@/lib/location-store";
import { localTimeForInstant } from "@/domain/plan-options";
import type { SavedPlace } from "@/server/account/places";

/** `typed`: what she typed to find a search result — the only text a plan keeps as her own query. */
export type PickedPlace = { name: string; lat: number; lon: number; source: "search" | "saved_place" | "selected_point"; placeId?: string; typed?: string } | { here: true; lat: number; lon: number };

/**
 * The query a plan stores for a picked place: her typed words for a search result, her own label for a saved
 * place. A Google result's display name is provider content: it lives only in the tab's resolution and is
 * never copied into a field kept as hers (sprint 01 save boundary, audit of PlanDecision.pick).
 */
export function queryFor(p: Exclude<PickedPlace, { here: true }>): string {
  const typed = p.typed?.trim().slice(0, 160);
  if (p.source === "saved_place") return p.name.slice(0, 160);
  if (typed) return typed;
  return p.placeId?.startsWith("g:") ? "" : p.name.slice(0, 160);
}
type Hit = { id: string; name: string; kind: string; lat: number; lon: number; distanceM?: number };

/**
 * Where: search (as you type, deeper on Enter), your saved places, and — only when you choose it —
 * your current location. A failed search says so; it is never "no such place".
 */
export function PlaceSheet({ open, onClose, title, onPick, saved, near, allowHere, osmOnly }: { open: boolean; onClose: () => void; title: string; onPick: (p: PickedPlace) => void; saved: SavedPlace[]; near: { lat: number; lon: number } | null; allowHere: boolean; osmOnly: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed" | "offline">("idle");
  const [hereMessage, setHereMessage] = useState<string | null>(null);
  const version = useRef(0);
  const run = async (query: string, deep: boolean) => {
    const v = ++version.current;
    if (query.trim().length < 2) { setHits([]); setState("idle"); return; }
    setState("loading");
    const r = await api<{ places: Hit[] }>("/api/geo/search", { body: { q: query.trim().slice(0, 80), near, deep, ...(osmOnly ? { source: "osm" } : {}) } });
    if (v !== version.current) return;
    if (!r.ok) { setState(r.network ? "offline" : "failed"); return; }
    setHits(r.data.places);
    setState("ready");
  };
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void run(q, false), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);
  const pickHere = async () => {
    setHereMessage("Finding you…");
    const l = await freshLocation();
    if (!locationUsable(l) || !l.point) return setHereMessage(l.status === "denied" ? "Location is off for Mira. Search for the place instead." : "A fresh, accurate position isn’t available. Search for the place instead.");
    setHereMessage(null);
    onPick({ here: true, lat: l.point.lat, lon: l.point.lon });
  };
  return (
    <Sheet open={open} onClose={onClose} title={title} labelledBy="place-sheet-title">
      <form onSubmit={(e) => { e.preventDefault(); void run(q, true); }} className="sticky top-0 z-10 bg-surface pb-3">
        <label htmlFor="place-q" className="sr-only">{title}</label>
        <div className="flex items-center gap-2 rounded-2xl bg-sunken px-3 focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5 text-ink-subtle" />
          <input id="place-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a place, address or landmark" autoComplete="off" enterKeyHint="search" className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none" />
          {q ? <button type="button" aria-label="Clear" onClick={() => setQ("")} className="grid size-9 place-items-center rounded-full"><Icon name="close" className="size-4" /></button> : null}
        </div>
      </form>
      <ul className="divide-y divide-line">
        {allowHere && !q ? (
          <li>
            <button type="button" onClick={() => void pickHere()} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-strong"><Icon name="locate" className="size-[18px]" /></span>
              <span className="flex-1"><span className="block font-semibold">Where I am now</span><span className="block text-xs text-ink-muted">Uses your location once, only because you chose it</span></span>
            </button>
            {hereMessage ? <p role="status" className="pb-2 text-sm text-ink-muted">{hereMessage}</p> : null}
          </li>
        ) : null}
        {!q ? saved.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onPick({ name: p.label, lat: p.lat, lon: p.lon, source: "saved_place", placeId: p.id })} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-sunken"><Icon name="star" className="size-[18px] text-ink-muted" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.label}</span>{p.address ? <span className="block truncate text-xs text-ink-muted">{p.address}</span> : null}</span>
            </button>
          </li>
        )) : null}
        {hits.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => onPick({ name: h.name, lat: h.lat, lon: h.lon, source: "search", placeId: h.id, typed: q })} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-sunken"><Icon name={kindIcon(h.kind)} className="size-[18px] text-ink-muted" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{h.name}</span><span className="block truncate text-xs text-ink-muted">{h.kind}{h.distanceM !== undefined ? ` · ${h.distanceM < 1000 ? `${Math.round(h.distanceM)} m` : `${(h.distanceM / 1000).toFixed(1)} km`} away` : ""}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" className="py-3 text-sm text-ink-muted">
        {state === "loading" ? "Looking…" : state === "failed" ? "Couldn’t search places just now. Try again." : state === "offline" ? "You’re offline. Your plan is kept; search when you’re connected." : state === "ready" && !hits.length ? "No match. Try a fuller name or a nearby landmark, then press Enter for a deeper search." : q.trim().length >= 2 && state === "ready" ? "Press Enter for a deeper search." : null}
      </p>
    </Sheet>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
function localAt(zone: string, base: Date, addMin = 0, setHour?: number, dayOffset = 0): string {
  const at = new Date(base.getTime() + addMin * 60_000);
  const local = localTimeForInstant(at, zone); // YYYY-MM-DDTHH:mm in the plan's zone
  if (setHour === undefined) return local;
  const [d] = local.split("T");
  const day = new Date(`${d}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${pad(setHour)}:00`;
}

/** "Now", "Today 10:30 PM", "Tomorrow 5:00 AM", "Sat 4 Oct, 9:00 AM" — in the plan's zone. */
export { whenWords } from "@/domain/plan-name";

/** When: quick choices, an exact local time, depart/arrive, and the zone the time is in. */
export function WhenSheet({ open, onClose, local, zone, timeKind, allowArrive, quick, onChange, deviceZone, title, after }: { open: boolean; onClose: () => void; local: string; zone: string; timeKind: "depart_at" | "arrive_by"; allowArrive: boolean; quick: "go" | "run" | "travel"; onChange: (patch: { local?: string; zone?: string; timeKind?: "depart_at" | "arrive_by" }) => void; deviceZone: string; title?: string;
  /** For a way back: offer the hours after the trip there instead of "now". */
  after?: Date | null }) {
  const now = new Date();
  const clockOf = (v: string) => { const [h, m] = v.slice(11, 16).split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
  const choices = after
    ? [60, 120, 180, 240].map((m) => { const v = localAt(zone, after, m); return [`${m / 60} h later · ${clockOf(v)}`, v]; })
    : quick === "run"
    ? [["Now", localAt(zone, now)], ["Tomorrow 5 AM", localAt(zone, now, 0, 5, 1)], ["Tomorrow 6 AM", localAt(zone, now, 0, 6, 1)], ["This evening 6 PM", localAt(zone, now, 0, 18, 0)]]
    : [["Now", localAt(zone, now)], ["In 30 min", localAt(zone, now, 30)], ["Tonight 10 PM", localAt(zone, now, 0, 22, 0)], ["Tomorrow 9 AM", localAt(zone, now, 0, 9, 1)]];
  const [zoneDraft, setZoneDraft] = useState(zone);
  return (
    <Sheet open={open} onClose={onClose} title={title ?? (quick === "travel" ? "When do you arrive?" : "When?")} labelledBy="when-sheet-title" footer={<button type="button" onClick={onClose} className="mira-primary w-full">Done</button>}>
      {allowArrive ? (
        <div role="radiogroup" aria-label="Timing" className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1">
          {(["depart_at", "arrive_by"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={timeKind === k} onClick={() => onChange({ timeKind: k })} className={cx("min-h-11 rounded-xl text-sm font-semibold", timeKind === k ? "bg-surface shadow-[var(--shadow-float)]" : "text-ink-muted")}>{k === "depart_at" ? "Leave at" : "Arrive by"}</button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {choices.map(([label, value]) => (
          <button key={label} type="button" aria-pressed={local === value} onClick={() => onChange({ local: value })} className={cx("min-h-11 rounded-full px-4 text-sm font-semibold ring-1", local === value ? "bg-accent text-accent-ink ring-accent" : "bg-surface ring-line-strong")}>{label}</button>
        ))}
      </div>
      <label className="mt-5 block text-sm font-semibold">Exact date and time
        <input type="datetime-local" value={local} onChange={(e) => onChange({ local: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 text-base font-normal" />
      </label>
      <div className="mt-4 rounded-2xl bg-sunken p-3 text-sm">
        <p className="text-ink-muted">Times are in <strong className="text-ink">{zone.replace(/_/g, " ")}</strong>{zone === deviceZone ? " (this phone)" : ""}. Mira never assumes a zone you didn’t choose.</p>
        <form onSubmit={(e) => { e.preventDefault(); onChange({ zone: zoneDraft.trim() }); }} className="mt-2 flex gap-2">
          <label htmlFor="zone-input" className="sr-only">Time zone</label>
          <input id="zone-input" list="mira-time-zones" value={zoneDraft} onChange={(e) => setZoneDraft(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface px-3" placeholder="e.g. Asia/Dubai" />
          <button type="submit" className="min-h-11 rounded-xl px-3 font-semibold text-accent-strong">Use</button>
        </form>
      </div>
    </Sheet>
  );
}
