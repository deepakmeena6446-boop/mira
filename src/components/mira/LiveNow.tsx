"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { MiraPulse } from "@/components/app/MiraPulse";
import { daylightAt } from "@/domain/plan-options";
import { clockIn, type DaylightState } from "@/domain/daylight";

/** Sky for the card, from the calculated daylight state — information, not decoration. */
const SKY: Record<DaylightState, { bg: string; ink: string; muted: string; chip: string }> = {
  daylight: { bg: "linear-gradient(160deg,#dfe9ff 0%,#f4f6ff 55%,#fff3df 100%)", ink: "#14213d", muted: "#4b5a78", chip: "rgb(255 255 255 / .7)" },
  uncertain: { bg: "linear-gradient(160deg,#2b2f6b 0%,#6a4a8c 55%,#e08a5a 100%)", ink: "#fff8f0", muted: "#f0dccb", chip: "rgb(255 255 255 / .14)" },
  dark: { bg: "linear-gradient(165deg,#0b1430 0%,#16224a 60%,#24305e 100%)", ink: "#f0f3fc", muted: "#aebbdc", chip: "rgb(255 255 255 / .09)" },
};
const SEG: Record<DaylightState, string> = { daylight: "#ffd27a", uncertain: "#c98bb0", dark: "#3a4a85" };

/** The next 12 h as daylight / twilight / dark segments, from the same solar calculation the briefs use. */
export function daylightSegments(from: Date, point: { lat: number; lon: number }, hours = 12): Array<{ state: DaylightState; start: Date; share: number }> {
  const step = 15 * 60_000;
  const n = (hours * 3_600_000) / step;
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
 * "Right now, around you": the moment Mira proves she knows something. Every number here is a
 * checked or released fact with its own screen of evidence one tap away (Around); none is a rating.
 */
export function LiveNowCard({ now, point, area, stats, line, onLocate, locating, locationState }: {
  now: Date | null;
  point: { lat: number; lon: number } | null;
  area: string | null;
  stats: LiveStat[];
  line: React.ReactNode | null;
  onLocate: () => void;
  locating: boolean;
  locationState: "idle" | "asking" | "ok" | "denied" | "unavailable";
}) {
  const state: DaylightState = now && point && Math.abs(point.lat) <= 72 ? daylightAt(now, point) : now && (now.getHours() >= 19 || now.getHours() < 6) ? "dark" : "daylight";
  const sky = SKY[state];
  const segments = now && point && Math.abs(point.lat) <= 72 ? daylightSegments(now, point) : null;
  const firstChange = segments && segments.length > 1 ? segments[1] : null;
  return (
    <section aria-label="Right now, around you" className="relative overflow-hidden rounded-[1.75rem] p-5 shadow-[0_18px_40px_-18px_rgb(20_33_61/.45)]" style={{ background: sky.bg, color: sky.ink }}>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold" style={{ color: sky.muted }}>
          <MiraPulse size={12} state={point ? "with-you" : "observing"} ambient={Boolean(point)} />
          {point ? "Live around you" : "Mira, around you"}
        </p>
        {area ? <p className="truncate text-[0.8125rem] font-semibold" style={{ color: sky.muted }}><Icon name="locate" className="mr-1 inline size-3.5" />{area}</p> : null}
      </div>

      {point && now ? (
        <>
          <p className="mt-3 text-[1.65rem] font-semibold leading-tight tracking-[-0.03em]">
            {clockIn(now)} · {state === "dark" ? "Dark now" : state === "uncertain" ? "Twilight" : "Daylight"}
          </p>
          {segments ? (
            <div className="mt-3" aria-label={firstChange ? `${firstChange.state === "dark" ? "Dark" : firstChange.state === "daylight" ? "Daylight" : "Twilight"} from about ${clockIn(firstChange.start)}` : "No change in the next 12 hours"}>
              <div className="flex h-2 overflow-hidden rounded-full" aria-hidden>
                {segments.map((s, i) => <span key={i} style={{ width: `${s.share * 100}%`, background: SEG[s.state] }} />)}
              </div>
              <div className="mt-1.5 flex justify-between text-[0.72rem] font-medium" style={{ color: sky.muted }}>
                <span>now</span>
                {firstChange ? <span>{firstChange.state === "dark" ? "dark" : firstChange.state === "daylight" ? "daylight" : "twilight"} from {clockIn(firstChange.start)}</span> : null}
                <span>+12 h</span>
              </div>
            </div>
          ) : null}
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl px-3 py-2.5" style={{ background: sky.chip }}>
                <dt className="sr-only">{s.label}</dt>
                <dd className={cx("text-[1.35rem] font-semibold leading-none tabular-nums", s.state === "loading" && "animate-pulse")}>{s.state === "loading" ? "…" : s.state === "failed" ? "—" : s.value}</dd>
                <dd className="mt-1.5 text-[0.7rem] leading-tight" style={{ color: sky.muted }}>{s.state === "failed" ? `${s.label}: couldn’t check` : s.label}</dd>
              </div>
            ))}
          </dl>
          {line ? <p className="mt-3 text-[0.9rem] leading-snug">{line}</p> : null}
          <Link href="/around" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold" style={{ background: sky.chip }}>
            See everything around you <Icon name="arrow" className="size-4" />
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 text-[1.45rem] font-semibold leading-tight tracking-[-0.02em]">See what’s open, lit and noticed around you — right now.</p>
          <p className="mt-2 text-sm" style={{ color: sky.muted }}>
            {locationState === "denied" ? "Location is off for Mira. Allow it in your browser’s site settings — or check any place by name." : locationState === "unavailable" ? "Couldn’t find you just now. Try again outdoors, or check a place by name." : "Your location is used on this phone for this view only. Mira never keeps a history of where you’ve been."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onLocate} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#14213d]"><Icon name="locate" className="size-4" />{locating ? "Finding you…" : "Use my location"}</button>
            <Link href="/around?check=1" className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold" style={{ background: sky.chip }}><Icon name="search" className="size-4" />Check a place</Link>
          </div>
        </>
      )}
    </section>
  );
}
