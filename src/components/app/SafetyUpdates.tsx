"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api-client";
import { useOverlay } from "@/lib/use-overlay";
import { cx } from "@/components/ui/cx";
import type { EvidenceState } from "@/domain/evidence-state";
import {
  CATEGORY_LABEL,
  DEFAULT_WINDOW,
  EMPTY_CAVEAT,
  EMPTY_LINE,
  FAILED_LINE,
  NOT_A_RATING,
  REPORTING_NOTE,
  ageLabel,
  indexedLabel,
  isHttpUrl,
  locationLabel,
  partialLine,
  summaryLine,
  type SafetyArea,
  type SafetyUpdate,
  type SafetyUpdatesData,
  type SafetyWindow,
} from "@/domain/safety-updates";

type Answer = { area: SafetyArea | null; evidence: EvidenceState<SafetyUpdatesData> };
type Loaded = { key: string; answer: Answer | null; failed: boolean };

/**
 * Safety updates for a point she chose (her location on Home, or a destination): fetched once
 * per ~1 km and window — never on every re-render or every move of the dot. The server caches
 * per city, so this is cheap to show.
 */
function useSafetyUpdates(point: { lat: number; lon: number } | null, windowDays: SafetyWindow, retry: number): { loading: boolean; loaded: Loaded | null; previous: Loaded | null } {
  const key = point ? `${point.lat.toFixed(2)},${point.lon.toFixed(2)}|${windowDays}|${retry}` : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!point) return;
    let stop = false;
    void api<Answer>("/api/safety-updates", { body: { lat: point.lat, lon: point.lon, window: windowDays } }).then((r) => {
      if (!stop) setLoaded({ key, answer: r.ok ? r.data : null, failed: !r.ok });
    });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // `previous` keeps the last answer on screen while another window loads (no flicker, no reopened sheet).
  return { loading: Boolean(point) && loaded?.key !== key, loaded: loaded?.key === key ? loaded : null, previous: loaded };
}

/**
 * The restrained Home / destination section: one line, never a wall of headlines. "No updates"
 * is said with its caveat; a failed check says MIRA couldn't check — never "nothing happened";
 * a partial check with nothing to show says what couldn't be checked — never "no updates".
 */
export function SafetyUpdatesSection({ point, heading = "Safety updates", className }: { point: { lat: number; lon: number } | null; heading?: string; className?: string }) {
  const [windowDays, setWindowDays] = useState<SafetyWindow>(DEFAULT_WINDOW);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const { loading, loaded, previous } = useSafetyUpdates(point, windowDays, retry);
  if (!point) return null;

  const answer = loaded?.answer ?? null;
  const ev = answer?.evidence;
  const data = ev && "data" in ev ? ev.data : null;
  const where = answer?.area ? ` · ${answer.area.name}` : "";
  const prevEv = previous?.answer?.evidence;
  const sheetData = data ?? (open && prevEv && "data" in prevEv ? prevEv.data : null);
  const sheetEv = data ? ev : prevEv;
  const sheetPartial = sheetEv?.state === "partial" ? partialLine(sheetEv.sources, !sheetData?.updates.length) : null;

  let body: React.ReactNode;
  if (loading) body = <p className="mt-2 text-sm text-ink-muted">Checking recent updates…</p>;
  else if (!answer || loaded?.failed || ev?.state === "failed") {
    body = (
      <p className="mt-2 text-sm text-ink-muted">
        {FAILED_LINE}{" "}
        <button type="button" onClick={() => setRetry((n) => n + 1)} className="min-h-11 font-bold text-accent">
          Try again
        </button>
      </p>
    );
  } else if (ev?.state === "unavailable") {
    body = ev.sources.some((x) => x.source === "area")
      ? <p className="mt-2 text-sm text-ink-muted">MIRA couldn&apos;t tell which city this is, so it didn&apos;t check for updates.</p>
      : <p className="mt-2 text-sm text-ink-muted">Safety updates aren&apos;t available right now.</p>;
  }
  else if (data && !data.updates.length && ev?.state === "partial") {
    // Nothing shown, but not everything was checked (a source or the relevance check): not "no updates".
    body = (
      <p className="mt-2 text-sm text-ink-muted">
        {partialLine(ev.sources, true)}{" "}
        <button type="button" onClick={() => setRetry((n) => n + 1)} className="min-h-11 font-bold text-accent">
          Try again
        </button>
      </p>
    );
  } else if (data && !data.updates.length) {
    body = (
      <p className="mt-2 text-sm text-ink-muted">
        {EMPTY_LINE} {EMPTY_CAVEAT}
        {windowDays === 7 ? (
          <>
            {" "}
            <button type="button" onClick={() => setWindowDays(30)} className="font-bold text-accent">
              Check the past 30 days
            </button>
          </>
        ) : null}
      </p>
    );
  } else if (data) {
    body = (
      <div className="mt-2 rounded-3xl bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
        <p className="font-semibold">{summaryLine(data)}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Official advisories {data.counts.official} · News reports {data.counts.news} · Community reports: not in the beta
        </p>
        {ev?.state === "partial" ? <p className="mt-1 text-xs text-ink-muted">{partialLine(ev.sources, false)}</p> : null}
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="mt-2 min-h-11 rounded-full bg-accent-soft px-4 text-sm font-bold text-accent-strong">
          View updates
        </button>
      </div>
    );
  }

  return (
    <section className={cx("mt-5", className)} aria-label={heading}>
      <h2 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">
        {heading}
        <span className="normal-case tracking-normal">{where}</span>
      </h2>
      {body}
      {sheetData ? (
        <SafetyUpdatesSheet
          open={open}
          data={sheetData}
          updating={loading}
          partial={sheetPartial}
          windowDays={windowDays}
          onWindow={(w) => setWindowDays(w)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

/** Stays mounted and flips `open` (like HelpNearSheet), so the back-gesture history entry is pushed once. */
function SafetyUpdatesSheet({ open, data, updating, partial, windowDays, onWindow, onClose }: { open: boolean; data: SafetyUpdatesData; updating: boolean; partial: string | null; windowDays: SafetyWindow; onWindow: (w: SafetyWindow) => void; onClose: () => void }) {
  useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="safety-updates-h" className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgb(10_6_24/0.5)] animate-fade sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-[2rem] bg-surface shadow-[var(--shadow-float)] sm:rounded-[2rem]">
        <div className="px-5 pt-5">
          <h2 id="safety-updates-h" className="text-xl font-extrabold">
            Safety updates · {data.area.name}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{NOT_A_RATING}</p>
          <div className="mt-3 flex gap-2" role="group" aria-label="Time window">
            {([7, 30] as const).map((w) => (
              <button key={w} type="button" aria-pressed={windowDays === w} onClick={() => onWindow(w)} className={cx("min-h-11 rounded-full px-4 text-sm font-bold", windowDays === w ? "bg-ink text-canvas" : "bg-sunken text-ink-muted")}>
                Past {w} days
              </button>
            ))}
          </div>
          {updating ? <p role="status" className="mt-2 text-xs text-ink-muted">Checking the past {windowDays} days…</p> : null}
          {partial ? <p className="mt-2 text-xs text-ink-muted">{partial}</p> : null}
        </div>
        <ul className="mt-3 flex-1 space-y-3 overflow-y-auto px-5 pb-2">
          {data.updates.length ? data.updates.map((u) => <UpdateCard key={u.id} u={u} />) : partial ? null : <li className="text-sm text-ink-muted">{EMPTY_LINE} {EMPTY_CAVEAT}</li>}
        </ul>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          <p className="text-xs leading-relaxed text-ink-subtle">
            Found through a news index and official sources, then filtered by MIRA for relevance. Headlines are the publisher&apos;s words; MIRA doesn&apos;t verify them. Dates are when the news index first saw a report, which can be later than its publication. Community reports are a separate signal and aren&apos;t shown in the beta. Checked {ageLabel(data.checkedAt).toLowerCase()}.
          </p>
          <button type="button" onClick={onClose} className="mt-2 min-h-11 w-full rounded-full font-bold text-ink-muted hover:bg-sunken">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UpdateCard({ u }: { u: SafetyUpdate }) {
  const where = locationLabel(u);
  // Defense in depth: only http(s) links are ever rendered (the server already drops anything else).
  const link = isHttpUrl(u.originalUrl) ? u.originalUrl : null;
  const outlets = u.sources.filter((s) => isHttpUrl(s.url));
  const translation = u.translatedTitle && u.translatedTitle.trim().toLowerCase() !== u.title.trim().toLowerCase() ? u.translatedTitle : null;
  const seen = indexedLabel(u.publishedAt);
  const reported =
    u.sourceCount === outlets.length
      ? `Reported by ${u.sourceCount} sources`
      : u.sourceCount > 1
        ? `Reported by ${u.sourceCount} independent sources (${outlets.length} outlets)`
        : `One report, carried by ${outlets.length} outlets`;
  return (
    <li className="rounded-2xl border border-line p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
        <span className={cx("rounded-full px-2 py-0.5", u.sourceType === "official" ? "bg-ink text-canvas" : "bg-sunken text-ink-muted")}>{u.sourceType === "official" ? "Official source" : "News report"}</span>{" "}
        {CATEGORY_LABEL[u.category]}
      </p>
      <p className="mt-2 font-semibold text-mixed">{u.title}</p>
      {translation ? <p className="mt-1 text-sm text-ink-muted">Machine-translated: {translation}</p> : null}
      <p className="mt-1 text-xs text-ink-muted">
        {outlets.length > 1 ? `Latest report ${seen.charAt(0).toLowerCase()}${seen.slice(1)}` : seen}
        {where ? ` · ${where}` : ""}
        {u.eventYear ? ` · Event year stated: ${u.eventYear}` : ""}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        {u.sourceType === "official" ? "Official statement from" : "According to"} {u.publisher} · {REPORTING_NOTE[u.reporting]}
      </p>
      {u.sensitive ? <p className="mt-1 text-xs text-ink-muted">An active case: follow the source for the latest official appeal.</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">
            Read source
          </a>
        ) : null}
        {outlets.length > 1 ? (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold text-ink-muted">{reported}</summary>
            <ul className="space-y-1 pb-2">
              {outlets.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                    {s.publisher}
                  </a>
                  <span className="text-ink-muted">
                    {" "}
                    · {s.sourceType === "official" ? "official" : "news"} · first indexed {ageLabel(s.publishedAt).toLowerCase()} · “{s.title}”
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-subtle">One story reported by several outlets, not separate incidents. Copies of one wire story count once.</p>
          </details>
        ) : null}
      </div>
    </li>
  );
}
