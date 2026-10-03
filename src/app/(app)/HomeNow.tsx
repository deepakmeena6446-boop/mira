"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { Avatar } from "@/components/app/Avatar";
import { SignInSheet } from "@/components/app/SignInSheet";
import { RootHeader } from "@/components/mira/Frame";
import { Row, RowList } from "@/components/mira/Rows";
import { SituationChips } from "@/components/mira/Situations";
import { LiveNowCard, type LiveStat } from "@/components/mira/LiveNow";
import { HelpNextCard } from "@/components/mira/HelpNext";
import { api } from "@/lib/api-client";
import { handOffAsk } from "@/lib/ask-handoff";
import { greetingFor, rememberLocationChoice, shouldAutoLocate, useClock, useLocation, usableLocationPoint } from "@/lib/location-store";
import { useCountry } from "@/lib/locale-store";
import { setPlanDraft } from "@/lib/plan-store";
import { suggestionQuery } from "@/lib/trip-start";
import { usageMode, type UsageMode } from "@/lib/usage-signal";
import { hoursWords } from "@/lib/brief";
import { helpWeightsFor, hoursState, isNight, rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { localTimeInZone } from "@/domain/opening-hours";
import { newPlanDraft } from "@/domain/plan-state";
import { planLine, planTitle } from "@/domain/plan-name";
import { CATEGORY_LABEL, ageLabel, type SafetyUpdatesData } from "@/domain/safety-updates";
import type { EvidenceState } from "@/domain/evidence-state";
import type { HabitSuggestion } from "@/domain/habits";
import type { SavedPlace } from "@/server/account/places";
import type { SavedPlan } from "@/server/account/saved-plans";

type Noticed = { id: string; icon: string; tone: "accent" | "dusk" | "people"; eyebrow: string; title: string; detail: string; kind: "checked" | "people" | "estimate"; onOpen: () => void };
type Near = { key: string; help: { points: HelpPoint[]; failed: boolean } | null; notes: number | null; notesFailed: boolean };
type Contrib = { checks: Array<{ id: string; question: string; placeName: string; options: Array<{ value: string; label: string }> }>; impact: { line: string | null } };

/** Situations, not features: each is something she is about to do. */

/**
 * Home (docs/phase1-ux/01). It shows Mira instead of describing her: what is true around you right
 * now (live, sourced), where you're going, and the one-tap way to help the next person here. Mira's
 * other suggestions come last and only when real.
 */
export function HomeNow({ user, places, savedPlan, emailAlerts, journeyTo }: { user: { name: string; avatarUrl: string | null } | null; places: SavedPlace[]; savedPlan: SavedPlan | null; emailAlerts: boolean; journeyTo: string | null }) {
  const router = useRouter();
  const loc = useLocation(false);
  const clock = useClock();
  const country = useCountry();
  const point = usableLocationPoint(loc, clock?.getTime());
  const [signIn, setSignIn] = useState(false);
  const [ask, setAsk] = useState("");
  const [usage, setUsage] = useState<UsageMode>("cold");
  const [habit, setHabit] = useState<HabitSuggestion | null>(null);
  const [updates, setUpdates] = useState<{ key: string; data: SafetyUpdatesData | null } | null>(null);
  const [contrib, setContrib] = useState<Contrib | null>(null);
  const [near, setNearState] = useState<Near | null>(null);

  // Location is used only if she chose it before (or taps "Use my location").
  const idle = loc.status === "idle";
  const request = loc.request;
  useEffect(() => { if (idle && shouldAutoLocate()) void request(); }, [idle, request]);
  useEffect(() => {
    // Device storage exists only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsage(usageMode());
  }, []);

  // Her own habit and her waiting Mira Check / impact (signed in only).
  useEffect(() => {
    if (!user) return;
    let live = true;
    void api<{ suggestion: HabitSuggestion | null }>(`/api/me/habits/suggestion${suggestionQuery()}`).then((r) => { if (live && r.ok) setHabit(r.data.suggestion); });
    void api<Contrib>("/api/contribute").then((r) => { if (live && r.ok) setContrib(r.data); });
    return () => { live = false; };
  }, [user]);

  // What's around: Help Points (with listed hours), released notes, and local updates — per ~100 m.
  const areaKey = point ? `${point.lat.toFixed(3)},${point.lon.toFixed(3)}` : "";
  useEffect(() => {
    if (!areaKey || !point) return;
    let live = true;
    const at = { lat: point.lat, lon: point.lon };
    const merge = (patch: Partial<Omit<Near, "key">>) => setNearState((n) => ({ ...(n?.key === areaKey ? n : { key: areaKey, help: null, notes: null, notesFailed: false }), ...patch }));
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { ...at, ...(country.iso ? { country: country.iso } : {}) } }).then((r) => {
      if (live) merge({ help: { points: r.ok ? r.data.helpPoints : [], failed: !r.ok || r.data.evidence.state === "failed" } });
    });
    void api<{ notes: unknown[] }>("/api/community/nearby", { body: at }).then((r) => { if (live) merge({ notes: r.ok ? r.data.notes.length : 0, notesFailed: !r.ok }); });
    void api<{ evidence: EvidenceState<SafetyUpdatesData> }>("/api/safety-updates", { body: { ...at, window: 7 } }).then((r) => {
      if (live) setUpdates({ key: areaKey, data: r.ok && "data" in r.data.evidence ? r.data.evidence.data : null });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey]);
  const nearNow = near?.key === areaKey ? near : null;

  // Ranked for right now; "listed open" uses the place's own hours at this minute, never "staffed".
  const zone = country.timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null);
  const localNow = clock ? localTimeInZone(clock, zone) : null;
  const ranked = point && nearNow?.help ? rankHelpPoints(nearNow.help.points, point, { situation: "nearby", night: localNow ? isNight(Math.floor(localNow.minute / 60)) : false, weights: helpWeightsFor(country.iso), timeZone: zone, now: localNow ?? undefined, at: clock?.getTime() }) : [];
  const openNow = ranked.filter((p) => { const h = hoursState(p, localNow ?? undefined, 0, clock?.getTime()); return h.kind === "open_24h" || h.kind === "open_now" || h.kind === "listed_open"; });
  const nearestOpen = openNow[0] ?? null;
  const helpTotal = nearNow?.help?.points.length ?? 0;
  const helpState: LiveStat["state"] = !nearNow?.help ? "loading" : nearNow.help.failed ? "failed" : "ok";
  const stats: LiveStat[] = [
    { label: "Help Points open now", value: `${openNow.length}/${helpTotal}`, state: helpState },
    { label: "to the nearest", value: nearestOpen ? `${nearestOpen.minutes} min` : "—", state: helpState },
    { label: nearNow?.notes === 1 ? "note from people" : "notes from people", value: String(nearNow?.notes ?? 0), state: !nearNow || nearNow.notes === null ? "loading" : nearNow.notesFailed ? "failed" : "ok" },
  ];
  const line = nearestOpen ? (
    <><strong className="font-semibold text-[color:var(--sky-ink)]">{nearestOpen.name}</strong> is {hoursWords(hoursState(nearestOpen, localNow ?? undefined, 0, clock?.getTime()))}, about {nearestOpen.minutes} min away. Staffing isn’t verified.</>
  ) : nearNow?.help && !nearNow.help.failed ? (
    helpTotal ? <>None of the {helpTotal} Help Points near you is listed open right now. Emergency is always one tap away.</> : <>No Help Points found within a short walk in the sources checked — that doesn’t mean none exist.</>
  ) : null;

  const startPlanTo = (to: { label: string; lat: number; lon: number; id: string }) => {
    const draft = newPlanDraft(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setPlanDraft({ ...draft, touched: true, activity: `Go to ${to.label}`, ...(point ? { origin: { kind: "device", use: "from_here", point: { lat: point.lat, lon: point.lon } } } : {}), destination: { query: to.label, resolution: { source: "saved_place", name: to.label, point: { lat: to.lat, lon: to.lon }, placeId: to.id } } });
    router.push("/plan?for=go");
  };

  // At most two, and only when real: her habit, her saved plan, one local update.
  const noticed = useMemo<Noticed[]>(() => {
    const list: Noticed[] = [];
    const usual = habit ? places.find((p) => p.id === habit.placeId) : null;
    if (habit && usual) list.push({ id: "habit", icon: "route", tone: "accent", kind: "checked", eyebrow: "Your usual", title: `${usual.label} around now`, detail: `${habit.times} of your journeys at this hour · from your own history`, onOpen: () => startPlanTo(usual) });
    if (savedPlan) list.push({ id: "plan", icon: "clock", tone: "accent", kind: "checked", eyebrow: "Saved plan", title: savedPlan.draft.activity.trim() ? `${savedPlan.draft.activity.trim()} · ${planTitle(savedPlan.draft)}` : planTitle(savedPlan.draft), detail: planLine(savedPlan.draft), onOpen: () => { setPlanDraft({ ...savedPlan.draft, touched: true }); router.push("/plan"); } });
    const data = updates?.key === areaKey ? updates.data : null;
    if (data && data.updates.length) {
      const latest = data.updates[0];
      list.push({ id: "update", icon: "info", tone: "dusk", kind: "checked", eyebrow: "Local update", title: `${data.updates.length} recent report${data.updates.length === 1 ? "" : "s"} near here`, detail: `Latest: ${CATEGORY_LABEL[latest.category] ?? "Report"} · ${ageLabel(latest.publishedAt)} · ${latest.publisher}`, onOpen: () => router.push("/around#updates") });
    }
    return list.slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habit, places, savedPlan, updates, areaKey]);

  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) return;
    let live = true;
    void api<{ notifications: Array<{ read_at: string | null }> }>("/api/me/notifications").then((r) => { if (live && r.ok) setUnread(r.data.notifications.filter((n) => !n.read_at).length); });
    return () => { live = false; };
  }, [user]);

  const submitAsk = (text: string) => {
    const t = text.trim();
    if (!t) return;
    handOffAsk(t);
    router.push("/mira");
  };

  const greeting = clock ? greetingFor(clock) : null;
  const firstName = user?.name.split(" ")[0];
  const cold = usage === "cold";

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        <RootHeader emailAlerts={emailAlerts} leading={<Link href="/" className="mira-wordmark" aria-label="Mira home">mira<span aria-hidden>↗</span></Link>} />

        <div className="mt-7 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.035em]">{greeting ? `${greeting.hello}${firstName ? `, ${firstName}` : ""}` : "Hello"}</h1>
            <p className="mt-0.5 text-[0.875rem] text-ink-muted">
              {journeyTo !== null ? `You’re on your way${journeyTo ? ` to ${journeyTo}` : ""} — I’m with you until you check in.` : cold ? "Here’s what’s true around you right now." : "Here’s what I know around you."}
            </p>
          </div>
          {user ? (
            <div className="flex shrink-0 items-center gap-2">
              {/* Updates: a contact accepted, a journey needs you. The count clears when the inbox is opened. */}
              <Link href="/inbox" aria-label={unread ? `Updates, ${unread} new` : "Updates"} className="relative grid size-10 place-items-center rounded-full bg-surface text-ink ring-1 ring-line">
                <Icon name="bell" className="size-[18px]" />
                {unread ? <span aria-hidden className="absolute -right-0.5 -top-0.5 grid min-w-[1.125rem] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-[1.125rem] text-accent-ink ring-2 ring-canvas">{unread > 9 ? "9+" : unread}</span> : null}
              </Link>
              <Link href="/me" aria-label="Your profile and settings"><Avatar name={user.name} src={user.avatarUrl} size={40} /></Link>
            </div>
          ) : (
            <button type="button" onClick={() => setSignIn(true)} className="min-h-11 shrink-0 rounded-full px-1 text-[0.875rem] font-semibold text-accent-strong">Sign in</button>
          )}
        </div>

        {/* 1. Mira knows: what's true around you, right now. */}
        <div className="mt-5">
          <LiveNowCard now={clock} point={point ? { lat: point.lat, lon: point.lon } : null} area={point ? loc.area : null} stats={stats} line={line} locating={loc.status === "asking"} locationState={loc.status} onLocate={() => { rememberLocationChoice(true); void loc.request(); }} />
        </div>

        {/* 2. Everyone makes it better: what's known here grows from what people add — one tap, right here. */}
        <div className="mt-3">
          <HelpNextCard check={contrib?.checks[0] ?? null} impactLine={contrib?.impact.line ?? null} signedIn={Boolean(user)} country={country.iso ?? null} />
        </div>

        {/* 3. Mira goes with you: where are you going? */}
        <section aria-labelledby="going-h" className="mt-8">
          <h2 id="going-h" className="text-[1.0625rem] font-semibold tracking-[-0.015em]">Where are you going?</h2>
          <form onSubmit={(e) => { e.preventDefault(); submitAsk(ask); }} className="m-card mt-2.5 flex items-center gap-2 rounded-[1.5rem] p-1.5 pl-4 focus-within:ring-2 focus-within:ring-accent">
            <span aria-hidden><Icon name="sparkle" className="size-5 text-accent" /></span>
            <label htmlFor="home-ask" className="sr-only">Tell Mira what you’re about to do</label>
            <input id="home-ask" value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={1000} placeholder="Tell Mira — “a run at 5 AM”, “home at 11”…" autoComplete="off" className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-subtle" />
            <button type="submit" aria-label="Ask Mira" disabled={!ask.trim()} className={cx("grid size-11 shrink-0 place-items-center rounded-full transition-colors", ask.trim() ? "bg-accent text-accent-ink" : "bg-sunken text-ink-subtle")}>
              <Icon name="arrow" className="size-5" />
            </button>
          </form>
          <SituationChips className="mt-2.5" />
        </section>

        {noticed.length ? (
          <RowList label="Mira noticed" id="noticed-h" className="mt-6">
            {noticed.map((n) => (
              <Row key={n.id} icon={n.icon} tone={n.tone} kind={n.kind} eyebrow={n.eyebrow} title={n.title} detail={n.detail} onClick={n.onOpen} ariaLabel={`${n.eyebrow}: ${n.title}`} />
            ))}
          </RowList>
        ) : null}

        <p className="mt-8 px-1 text-center text-[0.72rem] leading-relaxed text-ink-subtle">Mira never scores a place. Every fact shows where it came from, and what Mira can’t see is said too.</p>
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to save plans and go with Mira" />
    </div>
  );
}
