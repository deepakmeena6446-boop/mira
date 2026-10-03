"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { MiraPulse, type PulseState } from "@/components/app/MiraPulse";
import { daylightAt } from "@/domain/plan-options";
import { clockIn, type DaylightState } from "@/domain/daylight";

/** Sky for the card, from the calculated daylight state — information, not decoration. */
export const SKY: Record<DaylightState, { bg: string; ink: string; muted: string; chip: string }> = {
  daylight: { bg: "linear-gradient(160deg,#dfe9ff 0%,#f4f6ff 55%,#fff3df 100%)", ink: "#14213d", muted: "#4b5a78", chip: "rgb(20 33 61 / .1)" },
  uncertain: { bg: "linear-gradient(160deg,#2b2f6b 0%,#6a4a8c 55%,#e08a5a 100%)", ink: "#fff8f0", muted: "#f0dccb", chip: "rgb(255 255 255 / .16)" },
  dark: { bg: "linear-gradient(165deg,#0b1430 0%,#16224a 60%,#24305e 100%)", ink: "#f0f3fc", muted: "#aebbdc", chip: "rgb(255 255 255 / .1)" },
};
const SEG: Record<DaylightState, string> = { daylight: "#ffd27a", uncertain: "#c98bb0", dark: "#3a4a85" };
const word = (s: DaylightState) => (s === "dark" ? "dark" : s === "daylight" ? "daylight" : "twilight");

/** The sky state at a point and instant; falls back to the clock hour where the calculation isn't used. */
export function skyAt(at: Date | null, point: { lat: number; lon: number } | null): DaylightState {
  if (at && point && Math.abs(point.lat) <= 72) return daylightAt(at, point);
  return at && (at.getHours() >= 19 || at.getHours() < 6) ? "dark" : "daylight";
}

/** The next hours as daylight / twilight / dark segments, from the same solar calculation the briefs use. */
export function daylightSegments(from: Date, point: { lat: number; lon: number }, hours = 12): Array<{ state: DaylightState; start: Date; share: number }> {
  const step = 15 * 60_000;
  const n = Math.max(1, Math.round((hours * 3_600_000) / step));
  const out: Array<{ state: DaylightState; start: Date; share: number }> = [];
  for (let i = 0; i < n; i++) {
    const at = new Date(from.getTime() + i * step);
    const s = daylightAt(at, point);
    const last = out.at(-1);
    if (last && last.state === s) last.share += 1 / n;
    else out.push({ state: s, start: at, share: 1 / n });
  }
  return out;
}

export type LiveStat = { value: string; label: string; state: "ok" | "loading" | "failed" | "none" };

/**
 * The sky card: Mira's signature surface. Its colour is the calculated sky at the moment it talks
 * about (now, or a plan's departure); the strip shows what the sky does next; stats are facts with
 * their evidence one tap away. Used on Home, Around, Plan and the journey so all four read as one.
 */
export function SkyCard({ state, label, eyebrow, aside, title, strip, stats, line, footer, pulse = "observing", children, className }: {
  state: DaylightState;
  label: string;
  eyebrow?: React.ReactNode;
  aside?: React.ReactNode;
  title?: React.ReactNode;
  strip?: { from: Date; point: { lat: number; lon: number }; hours?: number; startLabel?: string } | null;
  stats?: LiveStat[];
  line?: React.ReactNode | null;
  footer?: { label: string; href?: string; onClick?: () => void } | null;
  pulse?: PulseState;
  children?: React.ReactNode;
  className?: string;
}) {
  const sky = SKY[state];
  const hours = strip?.hours ?? 12;
  const segments = strip && Math.abs(strip.point.lat) <= 72 ? daylightSegments(strip.from, strip.point, hours) : null;
  const firstChange = segments && segments.length > 1 ? segments[1] : null;
  const foot = "-mx-5 mt-4 flex min-h-13 w-[calc(100%+2.5rem)] items-center justify-between border-t px-5 text-left text-sm font-semibold";
  return (
    <section aria-label={label} className={cx("relative overflow-hidden rounded-[1.75rem] p-5 shadow-[0_24px_48px_-28px_rgb(20_33_61/.55)] ring-1 ring-white/10", footer ? "pb-0" : "", className)} style={{ background: sky.bg, color: sky.ink, ["--sky-ink" as string]: sky.ink, ["--sky-muted" as string]: sky.muted, ["--sky-chip" as string]: sky.chip }}>
      {eyebrow || aside ? (
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex min-w-0 items-center gap-2 text-[0.8125rem] font-semibold" style={{ color: sky.muted }}><MiraPulse size={12} state={pulse} ambient={pulse === "with-you"} /><span className="truncate">{eyebrow}</span></p>
          {aside ? <p className="shrink-0 truncate text-[0.8125rem] font-semibold" style={{ color: sky.muted }}>{aside}</p> : null}
        </div>
      ) : null}
      {title ? <div className="mt-4 text-[1.75rem] font-medium leading-tight tracking-[-0.035em]">{title}</div> : null}
      {segments ? (
        <div className="mt-3" aria-label={firstChange ? `${word(firstChange.state)} from about ${clockIn(firstChange.start)}` : `No change in the next ${hours} hours`}>
          <div className="flex h-1.5 gap-px overflow-hidden rounded-full" aria-hidden>
            {segments.map((s, i) => <span key={i} style={{ width: `${s.share * 100}%`, background: SEG[s.state] }} />)}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.72rem] font-medium" style={{ color: sky.muted }}>
            <span>{strip?.startLabel ?? "now"}</span>
            {firstChange ? <span>{word(firstChange.state)} from {clockIn(firstChange.start)}</span> : null}
            <span>+{hours} h</span>
          </div>
        </div>
      ) : null}
      {stats?.length ? (
        <dl className={cx("mt-5 grid", stats.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 border-l px-3 first:border-l-0 first:pl-0" style={{ borderColor: sky.chip }}>
              <dt className="sr-only">{s.label}</dt>
              <dd className={cx("truncate text-[1.5rem] font-medium leading-none tracking-[-0.02em] tabular-nums", s.state === "loading" && "animate-pulse")}>{s.state === "loading" ? "…" : s.state === "failed" ? "—" : s.value}</dd>
              <dd className="mt-1.5 text-[0.72rem] leading-tight" style={{ color: sky.muted }}>{s.state === "failed" ? `${s.label}: couldn’t check` : s.label}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {line ? <div className="mt-4 text-[0.9rem] leading-snug" style={{ color: sky.muted }}>{line}</div> : null}
      {children}
      {footer ? (
        footer.href ? (
          <Link href={footer.href} className={foot} style={{ borderColor: sky.chip }}>{footer.label}<Icon name="arrow" className="size-4" /></Link>
        ) : (
          <button type="button" onClick={footer.onClick} className={foot} style={{ borderColor: sky.chip }}>{footer.label}<Icon name="arrow" className="size-4" /></button>
        )
      ) : null}
    </section>
  );
}

/**
 * "Right now, around you": the moment Mira proves she knows something. Every number here is a
 * checked or released fact with its own screen of evidence one tap away (Around); none is a rating.
 */
export function LiveNowCard({ now, point, area, stats, line, onLocate, locating, locationState, footer = { label: "See everything around you", href: "/around" }, eyebrow }: {
  now: Date | null;
  point: { lat: number; lon: number } | null;
  area: string | null;
  stats: LiveStat[];
  line: React.ReactNode | null;
  onLocate: () => void;
  locating: boolean;
  locationState: "idle" | "asking" | "ok" | "denied" | "unavailable";
  footer?: { label: string; href?: string; onClick?: () => void } | null;
  eyebrow?: string;
}) {
  const state = skyAt(now, point);
  const sky = SKY[state];
  if (point && now) {
    return (
      <SkyCard state={state} label="Right now, around you" pulse="with-you" eyebrow={eyebrow ?? "Live around you"} aside={area ? <><Icon name="locate" className="mr-1 inline size-3.5" />{area}</> : null} title={`${clockIn(now)} · ${state === "dark" ? "Dark now" : state === "uncertain" ? "Twilight" : "Daylight"}`} strip={{ from: now, point }} stats={stats} line={line} footer={footer} />
    );
  }
  return (
    <SkyCard state={state} label="Right now, around you" eyebrow="Mira, around you">
      <p className="mt-3 text-[1.45rem] font-semibold leading-tight tracking-[-0.02em]">See what’s open, lit and noticed around you — right now.</p>
      <p className="mt-2 text-sm" style={{ color: sky.muted }}>
        {locationState === "denied" ? "Location is off for Mira. Allow it in your browser’s site settings — or check any place by name." : locationState === "unavailable" ? "Couldn’t find you just now. Try again outdoors, or check a place by name." : "Your location is used on this phone for this view only. Mira never keeps a history of where you’ve been."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onLocate} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#14213d]"><Icon name="locate" className="size-4" />{locating ? "Finding you…" : "Use my location"}</button>
        <Link href="/around?check=1" className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold" style={{ background: sky.chip }}><Icon name="search" className="size-4" />Check a place</Link>
      </div>
    </SkyCard>
  );
}
