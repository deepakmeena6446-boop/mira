"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useOverlay } from "@/lib/use-overlay";
import { useClock } from "@/lib/location-store";
import { HELP_CLASSES, SOURCE_NAME, helpWeightsFor, hoursLine, hoursShort, isNight, rankHelpPoints, type HelpClass, type HelpPoint, type RankedHelpPoint } from "@/domain/help-points";
import { localTime } from "@/domain/opening-hours";
import { useCountry } from "@/lib/locale-store";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { emergencyStatusNote, otherEmergencyNumbers } from "@/domain/country-context";
import { Icon } from "@/components/ui/Icon";
import { HELP_ICON } from "./kinds";

export interface UnsafeShareAction {
  label: string;
  detail: string;
  onShare: () => void | Promise<void>;
}

/**
 * "Tell my people now": emails her accepted email contacts with their live link, and prepares a
 * WhatsApp message for each contact with a number — which she opens and sends herself.
 */
export interface UnsafeTellAction {
  names: string[];
  /** Whether any of them is reached by email (then Mira sends); otherwise it's WhatsApp only. */
  email: boolean;
  onTell: () => Promise<{ told: string[]; failed: string[]; whatsapp?: Array<{ name: string; url: string }> } | { error: string }>;
}

/**
 * "I feel unsafe": a first-class state (blueprint §5D). Every action on this sheet is
 * deterministic and local-first, so it appears the instant it's opened — no model call and
 * no network round-trip before anything she can do. In order: go to a Help Point (the best
 * one and two more, ranked here on the device for this situation; ahead on her route when a
 * journey is running), tell her people (her Circle and live link, with nothing to re-enter),
 * call someone, Emergency, and — last and quietest — Mira.
 */
export function UnsafeSheet({
  open,
  onClose,
  me,
  area,
  helpPoints,
  helpLoading,
  helpFailed = false,
  helpPartial = false,
  route,
  onGoHelpPoint,
  goLabel,
  share,
  tell,
  peopleLoading = false,
  landmark,
  exclude,
  onTrip,
  staleLocation = false,
}: {
  open: boolean;
  onClose: () => void;
  me: { lat: number; lon: number } | null;
  area: string | null;
  helpPoints: HelpPoint[];
  helpLoading: boolean;
  /** The Help Point lookup failed (offline, server error): never shown as "none nearby". */
  helpFailed?: boolean;
  helpPartial?: boolean;
  route?: Array<[number, number]> | null;
  onGoHelpPoint: (p: RankedHelpPoint) => void;
  goLabel: string;
  share: UnsafeShareAction | null;
  tell?: UnsafeTellAction | null;
  /** Account/Circle lookup can finish after this instant-opening sheet appears. */
  peopleLoading?: boolean;
  /** The nearest named place she's by (for "your location in words"). */
  landmark?: string | null;
  /** Help Point classes she chose not to see. */
  exclude?: readonly HelpClass[];
  onTrip?: boolean;
  staleLocation?: boolean;
}) {
  useOverlay(open, onClose);
  const now = useClock();
  const locale = useCountry();
  const night = isNight((now ?? new Date()).getHours());
  const minuteKey = now ? Math.floor(now.getTime() / 60_000) : 0;
  const weights = useMemo(() => helpWeightsFor(locale.iso), [locale.iso]);
  const ranked = useMemo(
    () =>
      me
        ? rankHelpPoints(helpPoints, me, {
            situation: "unsafe",
            night,
            route,
            now: minuteKey ? localTime(new Date(minuteKey * 60_000)) : undefined,
            at: minuteKey ? minuteKey * 60_000 : undefined,
            exclude,
            weights,
          })
        : [],
    [helpPoints, me, night, route, minuteKey, exclude, weights],
  );
  const [first, ...more] = ranked;
  if (!open) return null;

  const sources = [...new Set(ranked.slice(0, 3).map((p) => SOURCE_NAME[p.source]))];
  const aheadNote = (p: RankedHelpPoint) => (p.ahead ? " · ahead on your way" : "");
  const shortHours = (p: RankedHelpPoint) => {
    const s = hoursShort(p.hoursNow, p.mayBeClosed);
    return s ? ` · ${s}` : "";
  };
  // Portal: screens are position:fixed (their own stacking context), and this must sit above the tab bar.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="unsafe-h" className="fixed inset-0 z-50 flex items-end justify-center bg-scrim animate-fade sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[var(--radius-lg)] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[var(--radius-lg)]"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="unsafe-h" className="text-xl font-semibold">
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

        {/* A calm lead: the nearest place with people, in one line (deterministic; no AI, no wait). */}
        <p className="mt-3 text-[1.0625rem] font-medium leading-snug">
          {first ? `${first.name} may be an option. The walking route has not been checked.` : "Here's what you can do right now."}
        </p>

        {/* 1. Go to a Help Point: the best one for right now, and two more */}
        <div className="mt-3">
          {first ? (
            <button type="button" onClick={() => onGoHelpPoint(first)} className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-line-strong bg-surface p-4 text-left hover:bg-sunken">
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink">
                <Icon name={HELP_ICON[first.cls] ?? "pin"} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-accent-strong">Go to a Help Point</span>
                <span className="block truncate font-semibold">{first.name}</span>
                <span className="block text-sm text-ink-muted">
                  {HELP_CLASSES[first.cls].label} · roughly {first.minutes} min by distance, route unverified{aheadNote(first)} · {hoursLine(first)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-accent-strong">{goLabel}</span>
            </button>
          ) : (
            <p className="rounded-[var(--radius-card)] bg-sunken p-4 text-sm text-ink-muted">
              {!me
                ? staleLocation ? "Your last position is too old to rank nearby places. Refresh location; calling and Emergency still work." : "Turn on location to see Help Points near you."
                : helpLoading
                  ? "Finding Help Points near you…"
                  : helpFailed
                    ? "Couldn't load Help Points — check your connection. Calling and Emergency still work."
                    : "No mapped Help Points were found from the sources checked. Other places may exist nearby."}
            </p>
          )}
          {helpPartial ? <p role="status" className="mt-2 text-xs text-ink-muted">Some Help Point sources couldn&apos;t be checked. Showing results that were available.</p> : null}
          {more.length ? (
            <ul className="mt-2 space-y-1">
              {more.slice(0, 2).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onGoHelpPoint(p)} className="flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left hover:bg-sunken">
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink-muted">
                      <Icon name={HELP_ICON[p.cls] ?? "pin"} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-ink-muted">
                        {" "}
                        · {HELP_CLASSES[p.cls].label} · roughly {p.minutes} min, route unverified{aheadNote(p)}{shortHours(p)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* 2. Tell people */}
        {tell ? <TellMyPeople tell={tell} /> : peopleLoading ? <p role="status" className="mt-3 text-sm text-ink-muted">Checking your Circle…</p> : null}
        {share ? (
          <button type="button" onClick={() => void share.onShare()} className="mt-3 flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-line p-4 text-left">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink">
              <Icon name="share" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{share.label}</span>
              <span className="block text-sm text-ink-muted">{share.detail}</span>
            </span>
          </button>
        ) : null}

        {/* 3. Call */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <CallSomeone />
          <EmergencyPill variant="block" />
        </div>
        {/* Partly verified, region-dependent or unverified: say so beside the call options. */}
        {emergencyStatusNote(locale) ? <p className="mt-2 text-xs text-ink-muted">{emergencyStatusNote(locale)}</p> : null}
        {/* Other official numbers for this country (e.g. Japan: 119 for ambulance and fire), from the same cited profile. */}
        {otherEmergencyNumbers(locale).length ? (
          <ul className="mt-2 space-y-1">
            {otherEmergencyNumbers(locale).map((n) => (
              <li key={n.number}>
                <a href={`tel:${n.number}`} className="flex min-h-11 items-center justify-between rounded-[var(--radius-control)] bg-sunken px-4 text-sm">
                  <span className="font-semibold">{n.label}</span>
                  <span className="font-semibold">{n.number}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {locale.helplines.length ? (
          <ul className="mt-2 space-y-1">
            {locale.helplines.map((h) => (
              <li key={h.number}>
                <a href={`tel:${h.number}`} className="flex min-h-11 items-center justify-between rounded-[var(--radius-control)] bg-sunken px-4 text-sm">
                  <span className="font-semibold">{h.name}</span>
                  <span className="font-semibold">
                    {h.number}
                    {h.hours ? <span className="font-normal text-ink-muted"> · {h.hours}</span> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Where she is, in words she can read to a call-taker (shown to her only; never sent). */}
        {me ? <LocationInWords me={me} area={area} landmark={landmark ?? first?.name ?? null} /> : null}

        {/* 4. Quiet options */}
        <div className="mt-4 grid gap-2 text-sm">
          <Link href="/mira" className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-1 font-semibold text-accent-strong">
            <Icon name="sparkle" className="size-4" /> Talk to Mira
          </Link>
          <button type="button" onClick={onClose} className="min-h-12 w-full rounded-[var(--radius-button)] border border-line-strong bg-surface font-semibold text-ink hover:bg-sunken">
            I&apos;m okay now
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
          {ranked.length ? `Help Points are types of places where help may be available, from ${sources.join(" and ")}. Mira can't confirm who's there right now. ` : ""}
          Emergency opens your phone&apos;s dialler: Mira doesn&apos;t call or alert anyone for you.
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
 * picker, then the dialler. Elsewhere, type a number. Mira never sees or keeps the number.
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
      <button type="button" onClick={() => void pick()} className="flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[0.95rem] font-semibold">
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
        className="min-h-14 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-sunken px-4 text-lg outline-none focus:border-accent"
      />
      <button type="submit" disabled={clean.length < 3} className="min-h-14 rounded-[var(--radius-control)] bg-accent px-5 font-semibold text-accent-ink disabled:opacity-50">
        Call
      </button>
    </form>
  );
}

function TellMyPeople({ tell }: { tell: UnsafeTellAction }) {
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "done"; told: string[]; failed: string[]; whatsapp: Array<{ name: string; url: string }> } | { kind: "error"; message: string }>({ kind: "idle" });
  const [opened, setOpened] = useState<string[]>([]);
  const who = tell.names.length <= 2 ? tell.names.join(" and ") : `${tell.names.slice(0, -1).join(", ")} and ${tell.names[tell.names.length - 1]}`;
  if (state.kind === "done") {
    return (
      <div role="status" className="mt-3 rounded-[var(--radius-card)] bg-mint-soft p-4 text-sm">
        {state.whatsapp.length ? (
          <>
            <p className="font-semibold">Ask them on WhatsApp — tap, then press Send:</p>
            <ul className="mt-2 grid gap-2">
              {state.whatsapp.map((w) => (
                <li key={w.url}>
                  <a href={w.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened((xs) => [...xs, w.name])} className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-surface px-4 font-semibold text-ink">
                    <Icon name="send" className="size-4" /> {opened.includes(w.name) ? `Opened WhatsApp for ${w.name} ✓` : `Send to ${w.name} on WhatsApp`}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className={state.whatsapp.length ? "mt-3" : ""}>
          {state.told.length ? <strong>Emailed {state.told.join(" and ")}. </strong> : null}
          {state.told.length ? "They can see where you are and were asked to check on you. " : ""}
          {state.failed.length ? `Couldn't reach ${state.failed.join(", ")} by email — call them, or send your live link. ` : ""}
          Mira didn&apos;t contact anyone else.
        </p>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={state.kind === "busy"}
      onClick={async () => {
        setState({ kind: "busy" });
        const r = await tell.onTell();
        setState("error" in r ? { kind: "error", message: r.error } : { kind: "done", told: r.told, failed: r.failed, whatsapp: r.whatsapp ?? [] });
      }}
      className="mt-3 flex w-full items-center gap-3 rounded-[var(--radius-card)] border-2 border-accent/40 p-4 text-left disabled:opacity-60"
    >
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-control)] bg-accent-soft text-accent-strong">
        <Icon name="send" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{state.kind === "busy" ? "Telling them…" : "Tell my people now"}</span>
        <span className="block text-sm text-ink-muted">
          {state.kind === "error" ? state.message : tell.email ? `Asks ${who} to check on you, with your live location — by email, and on WhatsApp where you've saved a number.` : `Opens WhatsApp for ${who} with your live location, asking them to check on you.`}
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
    <div className="mt-3 rounded-[var(--radius-control)] bg-sunken px-4 py-3 text-sm">
      <p className="text-[13px] font-medium text-ink-subtle">Your location in words</p>
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
        className="mt-1 min-h-11 font-semibold text-accent-strong"
      >
        {copied ? "Copied" : "Copy to read out or send"}
      </button>
    </div>
  );
}
