"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { Avatar } from "@/components/app/Avatar";
import { SignInSheet } from "@/components/app/SignInSheet";
import { IntentTile, MiraVoice, RootHeader } from "@/components/mira/Frame";
import { EvidenceGlyph } from "@/components/mira/Evidence";
import { api } from "@/lib/api-client";
import { handOffAsk } from "@/lib/ask-handoff";
import { greetingFor, rememberLocationChoice, shouldAutoLocate, useClock, useLocation, usableLocationPoint } from "@/lib/location-store";
import { setPlanDraft } from "@/lib/plan-store";
import { suggestionQuery } from "@/lib/trip-start";
import { usageMode, type UsageMode } from "@/lib/usage-signal";
import { clockIn, daylightOutlook, daylightSentence } from "@/domain/daylight";
import { newPlanDraft } from "@/domain/plan-state";
import { CATEGORY_LABEL, ageLabel, type SafetyUpdatesData } from "@/domain/safety-updates";
import type { EvidenceState } from "@/domain/evidence-state";
import type { HabitSuggestion } from "@/domain/habits";
import type { SavedPlace } from "@/server/account/places";
import type { SavedPlan } from "@/server/account/saved-plans";

type Noticed = { id: string; icon: string; tone: "accent" | "dusk" | "people"; eyebrow: string; title: string; detail: string; kind: "checked" | "people" | "estimate"; onOpen: () => void };

const ASK_IDEAS = ["Can I go for a run here around 5 AM?", "I’m walking from my hotel to a café at 10:30 PM", "I land at 1 AM — anything I should know?"];

/**
 * Home: "now". Who and where you are (only if you allowed it), what time it is in daylight terms,
 * what you're about to do, and at most two things Mira noticed. Nothing here is a feed.
 */
export function HomeNow({ user, places, savedPlan, emailAlerts, journeyTo }: { user: { name: string; avatarUrl: string | null } | null; places: SavedPlace[]; savedPlan: SavedPlan | null; emailAlerts: boolean; journeyTo: string | null }) {
  const router = useRouter();
  const loc = useLocation(false);
  const clock = useClock();
  const point = usableLocationPoint(loc, clock?.getTime());
  const [signIn, setSignIn] = useState(false);
  const [ask, setAsk] = useState("");
  const [usage, setUsage] = useState<UsageMode>("cold");
  const [habit, setHabit] = useState<HabitSuggestion | null>(null);
  const [updates, setUpdates] = useState<{ key: string; data: SafetyUpdatesData | null; failed: boolean } | null>(null);
  const [check, setCheck] = useState<{ placeName: string } | null>(null);

  // Location is used only if she chose it before (or taps "Use my location" below).
  const idle = loc.status === "idle";
  const request = loc.request;
  useEffect(() => { if (idle && shouldAutoLocate()) void request(); }, [idle, request]);
  useEffect(() => {
    // Device storage exists only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsage(usageMode());
  }, []);

  // Her own habit ("usually home around now"): only from her finished journeys, only when signed in.
  useEffect(() => {
    if (!user) return;
    let live = true;
    void api<{ suggestion: HabitSuggestion | null }>(`/api/me/habits/suggestion${suggestionQuery()}`).then((r) => { if (live && r.ok) setHabit(r.data.suggestion); });
    void api<{ checks: Array<{ placeName: string }> }>("/api/contribute").then((r) => { if (live && r.ok && r.data.checks[0]) setCheck(r.data.checks[0]); });
    return () => { live = false; };
  }, [user]);

  // One local update line, when the area has any (sourced and dated; never a rating).
  const areaKey = point ? `${point.lat.toFixed(2)},${point.lon.toFixed(2)}` : "";
  useEffect(() => {
    if (!areaKey || !point) return;
    let live = true;
    void api<{ evidence: EvidenceState<SafetyUpdatesData> }>("/api/safety-updates", { body: { lat: point.lat, lon: point.lon, window: 7 } }).then((r) => {
      if (live) setUpdates({ key: areaKey, data: r.ok && "data" in r.data.evidence ? r.data.evidence.data : null, failed: !r.ok });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey]);

  const outlook = clock && point ? daylightOutlook(clock, point) : null;
  const greeting = clock ? greetingFor(clock) : null;
  const firstName = user?.name.split(" ")[0];

  const startPlanTo = (to: { label: string; lat: number; lon: number; id: string }) => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const draft = newPlanDraft(new Date(), zone);
    setPlanDraft({ ...draft, touched: true, activity: `Go to ${to.label}`, ...(point ? { origin: { kind: "device", use: "from_here", point: { lat: point.lat, lon: point.lon } } } : {}), destination: { query: to.label, resolution: { source: "saved_place", name: to.label, point: { lat: to.lat, lon: to.lon }, placeId: to.id } } });
    router.push("/plan?for=go");
  };

  // At most two, in this order: her habit, her saved plan, a Mira Check waiting, one local update.
  const noticed = useMemo<Noticed[]>(() => {
    const list: Noticed[] = [];
    const usual = habit ? places.find((p) => p.id === habit.placeId) : null;
    if (habit && usual) list.push({ id: "habit", icon: "route", tone: "accent", kind: "checked", eyebrow: "Your usual", title: `${usual.label} around now`, detail: `${habit.times} of your journeys at this hour · from your own history`, onOpen: () => startPlanTo(usual) });
    if (savedPlan) list.push({ id: "plan", icon: "clock", tone: "accent", kind: "checked", eyebrow: "Saved plan", title: savedPlan.draft.activity || "Your saved plan", detail: `${savedPlan.draft.origin.kind === "named" ? savedPlan.draft.origin.query : "From here"} → ${savedPlan.draft.destination.query || "loop"} · ${savedPlan.draft.departureLocal.replace("T", " ")}`, onOpen: () => { setPlanDraft({ ...savedPlan.draft, touched: true }); router.push("/plan"); } });
    if (check) list.push({ id: "check", icon: "community", tone: "people", kind: "people", eyebrow: "A Mira Check for you", title: `Was ${check.placeName} open?`, detail: "One tap helps the next person who passes by", onOpen: () => router.push("/contribute#checks") });
    const data = updates?.key === areaKey ? updates.data : null;
    if (data && data.updates.length) {
      const latest = data.updates[0];
      list.push({ id: "update", icon: "info", tone: "dusk", kind: "checked", eyebrow: "Local update", title: `${data.updates.length} recent update${data.updates.length === 1 ? "" : "s"} near here`, detail: `Latest: ${CATEGORY_LABEL[latest.category] ?? "Report"} · ${ageLabel(latest.publishedAt)} · ${latest.publisher}`, onOpen: () => router.push("/around#updates") });
    }
    return list.slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habit, places, savedPlan, check, updates, areaKey]);

  const submitAsk = (text: string) => {
    const t = text.trim();
    if (!t) return;
    handOffAsk(t);
    router.push("/mira");
  };

  const firstTime = !user && usage === "cold";
  // Mira introduces herself until she's been used; after that she speaks to the moment.
  const introLine = journeyTo !== null
    ? `You’re on your way${journeyTo ? ` to ${journeyTo}` : ""}. I’m with you until you check in — your journey is one tap away below.`
    : firstTime || usage === "cold"
    ? "I’m Mira. Tell me what you’re about to do — I’ll check what I can about that place at that time, and stay with you on the way."
    : outlook?.state === "dark" || outlook?.changeTo === "dark"
      ? "It’s getting dark. Going somewhere? I’ll check the way and who can follow."
      : "Going somewhere, out for a run, or somewhere new? Start here.";

  return (
    <div className={cx("m-screen bg-companion", journeyTo !== null && "pb-[calc(var(--tabbar-space)+6rem)]")}>
      <div className="m-screen-inner">
        <RootHeader emailAlerts={emailAlerts} leading={<Link href="/" className="mira-wordmark" aria-label="Mira home">mira<span aria-hidden>↗</span></Link>} />

        {/* Who, where, when — in daylight terms. */}
        <section aria-label="Right now" className="mt-7">
          <div className="flex items-start justify-between gap-3">
            <h1 className="m-display">{greeting ? `${greeting.hello}${firstName ? `, ${firstName}` : ""}.` : "Hello."}</h1>
            {user ? (
              <Link href="/me" aria-label="Your profile and settings" className="shrink-0"><Avatar name={user.name} src={user.avatarUrl} size={40} /></Link>
            ) : (
              <button type="button" onClick={() => setSignIn(true)} className="min-h-11 shrink-0 rounded-full px-1 text-[0.875rem] font-semibold text-accent-strong">Sign in</button>
            )}
          </div>
          <MiraVoice size="lg" className="mt-3">{introLine}</MiraVoice>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-ink-muted">
            {clock ? <span className="tabular-nums">{clockIn(clock)}</span> : null}
            {point && loc.area ? <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Icon name="locate" className="size-3.5" />{loc.area}</span></> : null}
            {outlook && clock ? <><span aria-hidden>·</span><span className="inline-flex items-center gap-1.5 text-dusk"><Icon name="sun" className="size-4" />{daylightSentence(outlook, clock)}</span></> : null}
          </p>
          {!point ? (
            <button type="button" onClick={() => { rememberLocationChoice(true); void loc.request(); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-line">
              <Icon name="locate" className="size-4 text-accent" />
              {loc.status === "asking" ? "Finding you…" : loc.status === "denied" ? "Location is off · Mira still works without it" : loc.status === "unavailable" ? "Couldn’t find you · try again" : "Use my location for local context"}
            </button>
          ) : null}
        </section>

        {/* The question Mira asks first. */}
        <section aria-label="Ask Mira" className="mt-6">
          <form onSubmit={(e) => { e.preventDefault(); submitAsk(ask); }} className="m-card flex items-center gap-2 rounded-[1.5rem] p-1.5 pl-4 focus-within:ring-2 focus-within:ring-accent">
            <span aria-hidden className="mt-0.5"><Icon name="sparkle" className="size-5 text-accent" /></span>
            <label htmlFor="home-ask" className="sr-only">Tell Mira what you’re about to do</label>
            <input id="home-ask" value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={1000} placeholder="What are you about to do?" autoComplete="off" className="min-h-12 min-w-0 flex-1 bg-transparent text-[1.0625rem] outline-none placeholder:text-ink-subtle" />
            <button type="submit" aria-label="Ask Mira" disabled={!ask.trim()} className={cx("grid size-11 shrink-0 place-items-center rounded-full transition-colors", ask.trim() ? "bg-accent text-accent-ink" : "bg-sunken text-ink-subtle")}>
              <Icon name="arrow" className="size-5" />
            </button>
          </form>
          <div className="m-scroll-x mt-2.5 -mx-4 px-4 pb-1" aria-label="Things you could ask">
            {ASK_IDEAS.map((q) => (
              <button key={q} type="button" onClick={() => submitAsk(q)} className="min-h-10 shrink-0 rounded-full bg-sunken px-3.5 text-[0.8125rem] text-ink-muted hover:text-ink">{q}</button>
            ))}
          </div>
        </section>

        {/* Situations, not features. */}
        <section aria-labelledby="intents-h" className="mt-7">
          <h2 id="intents-h" className="m-label">Or start from what you’re doing</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <IntentTile href="/plan?for=go" icon="route" title="I’m going somewhere" hint="Compare ways, lit streets and help on the way" />
            <IntentTile href="/plan?for=run" icon="walk" tone="dusk" title="A run or walk" hint="Daylight, a route and help near your start" />
            <IntentTile href="/around?check=1" icon="search" tone="people" title="Check a place" hint="What Mira and people know about it" />
            <IntentTile href="/plan?for=travel" icon="airport" tone="ink" title="I’m travelling" hint="A late arrival, a new city or country" />
          </div>
        </section>

        {noticed.length ? (
          <section aria-labelledby="noticed-h" className="mt-7">
            <h2 id="noticed-h" className="m-label">Mira noticed</h2>
            <ul className="mt-3 space-y-2.5">
              {noticed.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={n.onOpen} className="m-card m-press flex w-full items-center gap-3 p-3.5 text-left">
                    <span aria-hidden className={cx("grid size-10 shrink-0 place-items-center rounded-xl", n.tone === "people" ? "bg-people-soft text-people" : n.tone === "dusk" ? "bg-dusk-soft text-dusk" : "bg-accent-soft text-accent-strong")}><Icon name={n.icon} className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="m-label inline-flex items-center gap-1.5"><EvidenceGlyph kind={n.kind} />{n.eyebrow}</span>
                      <span className="block truncate font-semibold">{n.title}</span>
                      <span className="block truncate text-[0.8125rem] text-ink-muted">{n.detail}</span>
                    </span>
                    <Icon name="chevron" className="size-4 text-ink-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {firstTime ? (
          <section aria-labelledby="how-h" className="mt-8 rounded-[var(--radius-tile)] bg-sunken/70 p-5">
            <h2 id="how-h" className="text-[1.0625rem] font-semibold">How Mira helps</h2>
            <ol className="mt-3 space-y-3 text-[0.9rem]">
              <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold">1</span><span><strong className="font-semibold">Tell Mira what you’re planning</strong> — a walk home, a 5 AM run, a late arrival.</span></li>
              <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold">2</span><span><strong className="font-semibold">Mira checks that time and place</strong> — daylight, streets mapped as lit, Help Points open then, local updates — and says plainly what it can’t see.</span></li>
              <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold">3</span><span><strong className="font-semibold">Go with Mira</strong> — share with people you choose, and check in when you arrive.</span></li>
            </ol>
            <MiraVoice className="mt-4 text-ink-muted">No account or location needed to plan. Mira never scores a place.</MiraVoice>
          </section>
        ) : null}
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to save plans and go with Mira" />
    </div>
  );
}
