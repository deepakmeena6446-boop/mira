"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { PlaceSummary } from "@/lib/selection-store";
import { cx } from "@/components/ui/cx";

interface SearchResponse {
  places: PlaceSummary[];
}

type Status = "idle" | "loading" | "done" | "error";

/**
 * Accessible combobox over MIRA's local pilot place index (no third-party
 * geocoding). The query goes to MIRA's own server only.
 */
export function PlacePicker({
  label,
  hint,
  placeholder = "Search a place, e.g. metro gate, college, pharmacy",
  onPick,
  disabled,
  initialValue = "",
  autoFocus,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  onPick: (p: PlaceSummary) => void;
  disabled?: boolean;
  initialValue?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [active, setActive] = useState(-1);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || disabled) {
      abortRef.current?.abort();
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus("loading");
      try {
        const res = await api<SearchResponse>(`/api/places?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        if (res.ok) {
          setResults(res.data.places);
          setActive(res.data.places.length ? 0 : -1);
          setStatus("done");
        } else {
          setErrorMsg(res.status === 503 ? "Place search is unavailable because pilot map data isn't loaded." : res.message);
          setStatus("error");
        }
      } catch {
        /* aborted */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, disabled]);

  const pick = (p: PlaceSummary) => {
    setQ(p.name);
    setOpen(false);
    onPick(p);
  };

  const searchable = q.trim().length >= 2 && !disabled;
  const showList = open && searchable;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block font-semibold">
        {label}
        {hint ? <span className="ml-1.5 text-sm font-normal text-ink-muted">{hint}</span> : null}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && showList && active >= 0 && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full min-h-12 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 py-3 text-base placeholder:text-ink-subtle focus-visible:border-accent disabled:bg-sunken"
      />
      <div aria-live="polite" className="sr-only">
        {searchable && status === "done" ? (results.length ? `${results.length} places found` : "No matching places in the pilot area") : ""}
      </div>
      {showList ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface shadow-lg">
          {status === "loading" && results.length === 0 ? <p className="px-4 py-3 text-sm text-ink-muted">Searching…</p> : null}
          {status === "error" ? <p className="px-4 py-3 text-sm text-ink-muted">{errorMsg}</p> : null}
          {status === "done" && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">
              No matching places in the pilot area. MIRA currently covers Delhi University North Campus around Vishwavidyalaya Metro.
            </p>
          ) : null}
          {results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
              {results.map((p, i) => (
                <li
                  key={p.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setActive(i)}
                  className={cx("flex min-h-11 cursor-pointer flex-col justify-center px-4 py-2", i === active && "bg-accent-soft")}
                >
                  <span className="font-medium text-mixed">{p.name}</span>
                  <span className="text-sm text-ink-muted">{p.kind}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
