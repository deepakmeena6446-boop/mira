"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useOverlay } from "@/lib/use-overlay";
import { useClock } from "@/lib/location-store";
import { HELP_CLASSES, SOURCE_NAME, hoursLine, isNight, rankHelpPoints, type HelpClass, type HelpPoint, type RankedHelpPoint } from "@/domain/help-points";
import { localTime } from "@/domain/opening-hours";
import { useLocale } from "@/lib/locale-store";
import { Icon } from "@/components/ui/Icon";

export interface UnsafeShareAction {
  label: string;
  detail: string;
  onShare: () => void | Promise<void>;
}

/** "Tell my people now": emails her accepted trusted contacts, with their live link. */
export interface UnsafeTellAction {
  names: string[];
  onTell: () => Promise<{ told: string[]; failed: string[] } | { error: string }>;
}

/**
 * "I feel unsafe": a first-class state (blueprint §5D). Every action on this sheet is
 * deterministic and local-first, so it appears the instant it's opened — no model call and
 * no network round-trip before anything she can do. Help Points come from lookups made
 * earlier (route / around her) and are ranked here on the device. Mira is the last,
 * quietest option, never the first.
 */
export function UnsafeSheet({
  open,
  onClose,
  me,
  area,
  helpPoints,
  helpLoading,
  helpFailed = false,
  route,
  onGoHelpPoint,
  goLabel,
  share,
  tell,
  landmark,
  exclude,
  onTrip,
}: {
  open: boolean;
  onClose: () => void;
  me: { lat: number; lon: number } | null;
  area: string | null;
  helpPoints: HelpPoint[];
  helpLoading: boolean;
  /** The Help Point lookup failed (offline, server error): never shown as "none nearby". */
  helpFailed?: boolean;
  route?: Array<[number, number]> | null;
  onGoHelpPoint: (p: RankedHelpPoint) => void;
  goLabel: string;
  share: UnsafeShareAction | null;
  tell?: UnsafeTellAction | null;
  /** The nearest named place she's by (for "your location in words"). */
  landmark?: string | null;
  /** Help Point classes she chose not to see. */
  exclude?: readonly HelpClass[];
  onTrip?: boolean;
}) {
  useOverlay(open, onClose);
  const now = useClock();
  const locale = useLocale();
  const night = isNight((now ?? new Date()).getHours());
  const minuteKey = now ? Math.floor(now.getTime() / 60_000) : 0;
  const ranked = useMemo(
    () => (me ? rankHelpPoints(helpPoints, me, { night, route, now: minuteKey ? localTime(new Date(minuteKey * 60_000)) : undefined, exclude }) : []),
    [helpPoints, me, night, route, minuteKey, exclude],
  );
  const [first, ...more] = ranked;
  if (!open) return null;
  const number = locale.emergency.number;

  const sources = [...new Set(ranked.slice(0, 3).map((p) => SOURCE_NAME[p.source]))];
  // Portal: screens are position:fixed (their own stacking context), and this must sit above the tab bar.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="unsafe-h" className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(10_6_24/0.5)] animate-fade sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[2rem] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[2rem]"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="unsafe-h" className="text-xl font-extrabold">
              Right now
            </h2>
            <p className="truncate text-sm text-ink-muted">
              {[area ? `Near ${area.replace(/^Near /, "")}` : null, now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null].filter(Boolean).join(" · ") || "Here's what you can do"}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken">
            <Icon name="close" className="size-4" />
          </button>
        </div>

        {/* 1. Nearest Help Point */}
        <div className="mt-4">
          {first ? (
            <button type="button" onClick={() => onGoHelpPoint(first)} className="flex w-full items-center gap-3 rounded-3xl bg-accent-soft p-4 text-left">
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-2xl">
                {HELP_CLASSES[first.cls].emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold text-accent-strong">Go to the nearest Help Point</span>
                <span className="block truncate font-semibold">{first.name}</span>
                <span className="block text-sm text-ink-muted">
                  {HELP_CLASSES[first.cls].label} · about {first.minutes} min walk · {hoursLine(first)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-accent">{goLabel}</span>
            </button>
          ) : (
            <p className="rounded-3xl bg-sunken p-4 text-sm text-ink-muted">
              {!me
                ? "Turn on location to see the nearest Help Point."
                : helpLoading
                  ? "Finding Help Points near you…"
                  : helpFailed
                    ? "Couldn't load Help Points — check your connection. Calling and Emergency still work."
                    : "No Help Points found close by. Head towards open shops and other people if you can."}
            </p>
          )}
          {more.length ? (
            <ul className="mt-2 space-y-1">
              {more.slice(0, 2).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onGoHelpPoint(p)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-sunken">
                    <span aria-hidden className="text-lg">
                      {HELP_CLASSES[p.cls].emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-ink-muted">
                        {" "}
                        · {HELP_CLASSES[p.cls].label} · {p.minutes} min{p.mayBeClosed ? " · may be closed" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* 2. Tell people */}
        {tell ? <TellMyPeople tell={tell} /> : null}
        {share ? (
          <button type="button" onClick={() => void share.onShare()} className="mt-3 flex w-full items-center gap-3 rounded-3xl border border-line p-4 text-left">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sunken text-accent">
              <Icon name="share" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{share.label}</span>
              <span className="block text-sm text-ink-muted">{share.detail}</span>
            </span>
          </button>
        ) : null}

        {/* 3. Call */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <CallSomeone />
          <a href={`tel:${number}`} aria-label={`Emergency call, ${number}`} className="flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-ink px-3 text-[0.95rem] font-extrabold text-canvas">
            <Icon name="phone" className="size-5" /> Emergency {number}
          </a>
        </div>
        {locale.helplines.length ? (
          <ul className="mt-2 space-y-1">
            {locale.helplines.map((h) => (
              <li key={h.number}>
                <a href={`tel:${h.number}`} className="flex min-h-11 items-center justify-between rounded-2xl bg-sunken px-4 text-sm">
                  <span className="font-semibold">{h.name}</span>
                  <span className="font-extrabold">
                    {h.number}
                    {h.hours ? <span className="font-normal text-ink-muted"> · {h.hours}</span> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {!locale.confirmed ? <p className="mt-2 text-xs text-ink-muted">Emergency number for this country not confirmed in MIRA yet. {number} works on most mobile networks.</p> : null}

        {/* Where she is, in words she can read to a call-taker (shown to her only; never sent). */}
        {me ? <LocationInWords me={me} area={area} landmark={landmark ?? first?.name ?? null} /> : null}

        {/* 4. Quiet options */}
        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          <Link href="/mira" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold text-accent hover:bg-accent-soft">
            <Icon name="sparkle" className="size-4" /> Talk to Mira
          </Link>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-3 font-bold text-ink-muted hover:bg-sunken">
            I&apos;m okay now
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
          {ranked.length ? `Help Points are places usually staffed, from ${sources.join(" and ")}; MIRA can't confirm who's there right now. ` : ""}
          Emergency opens your phone&apos;s dialler: MIRA doesn&apos;t call or alert anyone for you.
          {onTrip ? " Your live location keeps updating only while the trip screen is open." : ""}
        </p>
      </div>
    </div>,
    document.body,
  );
}

type ContactsPicker = { select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ tel?: string[] }>> };

/**
 * "Call someone": on phones that support it (Android Chrome), the phone's own contact
 * picker, then the dialler. Elsewhere, type a number. MIRA never sees or keeps the number.
 */
function CallSomeone() {
  const [typing, setTyping] = useState(false);
  const [num, setNum] = useState("");
  const clean = num.replace(/[^\d+]/g, "").slice(0, 16);
  const pick = async () => {
    const picker = (navigator as Navigator & { contacts?: ContactsPicker }).contacts;
    if (picker?.select) {
      try {
        const [c] = await picker.select(["tel"], { multiple: false });
        const tel = c?.tel?.[0]?.replace(/[^\d+]/g, "");
        if (tel) {
          window.location.href = `tel:${tel}`;
          return;
        }
        return; // closed the picker
      } catch {
        /* fall through to typing a number */
      }
    }
    setTyping(true);
  };
  if (!typing) {
    return (
      <button type="button" onClick={() => void pick()} className="flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-line-strong bg-surface px-3 text-[0.95rem] font-extrabold">
        <Icon name="phone" className="size-5" /> Call someone
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 3) window.location.href = `tel:${clean}`;
      }}
      className="col-span-2 row-start-1 flex gap-2"
    >
      <label htmlFor="call-num" className="sr-only">
        Phone number to call
      </label>
      <input
        id="call-num"
        autoFocus
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={num}
        onChange={(e) => setNum(e.target.value)}
        placeholder="Number to call"
        className="min-h-14 min-w-0 flex-1 rounded-2xl border border-line bg-sunken px-4 text-lg outline-none focus:border-accent"
      />
      <button type="submit" disabled={clean.length < 3} className="min-h-14 rounded-2xl bg-accent px-5 font-extrabold text-accent-ink disabled:opacity-50">
        Call
      </button>
    </form>
  );
}

function TellMyPeople({ tell }: { tell: UnsafeTellAction }) {
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "done"; told: string[]; failed: string[] } | { kind: "error"; message: string }>({ kind: "idle" });
  const who = tell.names.length <= 2 ? tell.names.join(" and ") : `${tell.names.slice(0, -1).join(", ")} and ${tell.names[tell.names.length - 1]}`;
  if (state.kind === "done") {
    return (
      <p role="status" className="mt-3 rounded-3xl bg-mint-soft p-4 text-sm">
        {state.told.length ? <strong>Emailed {state.told.join(" and ")}. </strong> : null}
        {state.told.length ? "They can see where you are and were asked to check on you. " : ""}
        {state.failed.length ? `Couldn't reach ${state.failed.join(", ")} — call them, or send your live link. ` : ""}
        MIRA didn&apos;t contact anyone else.
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={state.kind === "busy"}
      onClick={async () => {
        setState({ kind: "busy" });
        const r = await tell.onTell();
        setState("error" in r ? { kind: "error", message: r.error } : { kind: "done", ...r });
      }}
      className="mt-3 flex w-full items-center gap-3 rounded-3xl border-2 border-accent/40 p-4 text-left disabled:opacity-60"
    >
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
        <Icon name="send" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold">{state.kind === "busy" ? "Telling them…" : "Tell my people now"}</span>
        <span className="block text-sm text-ink-muted">
          {state.kind === "error" ? state.message : `Emails ${who} your live location and asks them to check on you.`}
        </span>
      </span>
    </button>
  );
}

function LocationInWords({ me, area, landmark }: { me: { lat: number; lon: number }; area: string | null; landmark: string | null }) {
  const [copied, setCopied] = useState(false);
  const place = [landmark ? `near ${landmark}` : null, area?.replace(/^Near /, "") ?? null].filter(Boolean).join(", ");
  const coords = `${me.lat.toFixed(5)}, ${me.lon.toFixed(5)}`;
  const text = `I'm ${place || "here"}. Coordinates: ${coords}.`;
  return (
    <div className="mt-3 rounded-2xl bg-sunken px-4 py-3 text-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Your location in words</p>
      <p className="mt-1">
        {place ? <span className="font-semibold">I&apos;m {place}.</span> : null} <span className="text-ink-muted">Coordinates {coords}</span>
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="mt-1 min-h-11 font-bold text-accent"
      >
        {copied ? "Copied" : "Copy to read out or send"}
      </button>
    </div>
  );
}
