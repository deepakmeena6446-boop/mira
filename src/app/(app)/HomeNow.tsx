"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/app/Avatar";
import { SignInSheet } from "@/components/app/SignInSheet";
import { RootHeader } from "@/components/mira/Frame";
import { Row, RowList } from "@/components/mira/Rows";
import { StartChoices } from "@/components/mira/Situations";
import { greetingKey, useT } from "@/lib/i18n";
import { LiveNowCard } from "@/components/mira/LiveNow";
import { api } from "@/lib/api-client";
import { handOffAsk } from "@/lib/ask-handoff";
import { shouldAutoLocate, useClock, useLocation, usableLocationPoint } from "@/lib/location-store";
import { useCountry } from "@/lib/locale-store";
import { useCurrentTrip } from "@/lib/current-trip-store";
import { setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import { suggestionQuery } from "@/lib/trip-start";
import { hoursWords } from "@/lib/brief";
import { helpWeightsFor, hoursState, isNight, rankHelpPoints, type HelpPoint } from "@/domain/help-points";
import { localTimeInZone } from "@/domain/opening-hours";
import { newPlanDraft, type PlanDraft } from "@/domain/plan-state";
import { planLine, planTitle } from "@/domain/plan-name";
import type { EvidenceState } from "@/domain/evidence-state";
import type { HabitSuggestion } from "@/domain/habits";
import type { SavedPlace } from "@/server/account/places";
import type { SavedPlan } from "@/server/account/saved-plans";

type Near = { key: string; points: HelpPoint[]; failed: boolean };

/** Ways people start, as she might say them. Tapping one fills the box; it's never sent for her. */
const EXAMPLES = ["Run at 5 AM tomorrow", "Heading home at 11 PM", "Dinner in a new area"];

/** A tab plan worth offering back: it names a place (or a named start for a loop), not just an opened form. */
function resumable(draft: PlanDraft | null): PlanDraft | null {
  if (!draft?.touched) return null;
  const to = draft.destination.resolution || draft.destination.query.trim();
  const loopFrom = draft.loop && draft.origin.kind === "named" && (draft.origin.resolution || draft.origin.query.trim());
  return to || loopFrom ? draft : null;
}

/**
 * Home (docs/sprints/mira-companion-48h/02): purpose and the first action come first — ask Mira, plan an
 * outing, or look around a place. Nothing is counted, asked for (no location question) or requested from
 * her before her own job; one row brings back an open journey or a plan. What's around her appears only
 * after she has chosen to let Mira use her location.
 */
export function HomeNow({ user, places, savedPlan, emailAlerts, journeyTo: serverJourneyTo, helpExclude = [] }: { user: { name: string; avatarUrl: string | null } | null; places: SavedPlace[]; savedPlan: SavedPlan | null; emailAlerts: boolean; journeyTo: string | null; helpExclude?: string[] }) {
  // The server's answer can be stale after client navigation: the shared store keeps it current.
  const live = useCurrentTrip(serverJourneyTo === null ? null : { state: "active", destination: serverJourneyTo || null, etaAt: "", following: [] });
  const journeyTo = live ? (live.destination ?? "") : null;
  const router = useRouter();
  const loc = useLocation(false);
  const clock = useClock();
  const tabDraft = resumable(usePlanDraft());
  // Home doesn't send her position; when followers' view is old or empty, say how to fix it (audit P01-004).
  const staleSpot = Boolean(live?.following.length) && (live?.sharedAt === null || (live?.sharedAt != null && clock != null && clock.getTime() - new Date(live.sharedAt).getTime() >= 120_000));
  const country = useCountry();
  const point = usableLocationPoint(loc, clock?.getTime());
  const [signIn, setSignIn] = useState(false);
  const [ask, setAsk] = useState("");
  const [habit, setHabit] = useState<HabitSuggestion | null>(null);
  const [near, setNear] = useState<Near | null>(null);

  // Location is used only if she chose it before (Settings, or "Use my location" in a flow). Home never asks.
  const idle = loc.status === "idle";
  const request = loc.request;
  useEffect(() => { if (idle && shouldAutoLocate()) void request(); }, [idle, request]);

  // Her own remembered habit (signed in, and only if she turned habits on).
  useEffect(() => {
    if (!user) return;
    let live = true;
    void api<{ suggestion: HabitSuggestion | null }>(`/api/me/habits/suggestion${suggestionQuery()}`).then((r) => { if (live && r.ok) setHabit(r.data.suggestion); });
    return () => { live = false; };
  }, [user]);

  // Around her, only once she chose location: the nearest Help Point listed open now (no counts, no digest).
  const areaKey = point ? `${point.lat.toFixed(3)},${point.lon.toFixed(3)}` : "";
  useEffect(() => {
    if (!areaKey || !point) return;
    let live = true;
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { lat: point.lat, lon: point.lon, ...(country.iso ? { country: country.iso } : {}) } }).then((r) => {
      if (live) setNear({ key: areaKey, points: r.ok ? r.data.helpPoints.filter((p) => !helpExclude.includes(p.cls)) : [], failed: !r.ok || r.data.evidence.state === "failed" });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey]);
  const nearNow = near?.key === areaKey ? near : null;

  // "Listed open" uses the place's own hours at this minute, never "staffed".
  const zone = country.timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null);
  const localNow = clock ? localTimeInZone(clock, zone) : null;
  const ranked = point && nearNow ? rankHelpPoints(nearNow.points, point, { situation: "nearby", night: localNow ? isNight(Math.floor(localNow.minute / 60)) : false, weights: helpWeightsFor(country.iso), timeZone: zone, now: localNow ?? undefined, at: clock?.getTime() }) : [];
  const nearestOpen = ranked.find((p) => { const h = hoursState(p, localNow ?? undefined, 0, clock?.getTime()); return h.kind === "open_24h" || h.kind === "open_now" || h.kind === "listed_open"; }) ?? null;
  const line = nearestOpen ? (
    <><strong className="font-semibold text-[color:var(--sky-ink)]">{nearestOpen.name}</strong> is {hoursWords(hoursState(nearestOpen, localNow ?? undefined, 0, clock?.getTime()))}, about {nearestOpen.minutes} min away. Staffing isn’t verified.</>
  ) : nearNow?.failed ? <>Mira couldn’t check Help Points near you just now.</> : nearNow ? <>No Help Point near you is listed open right now in the sources Mira checked.</> : null;

  const startPlanTo = (to: { label: string; lat: number; lon: number; id: string }) => {
    const draft = newPlanDraft(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setPlanDraft({ ...draft, touched: true, activity: `Go to ${to.label}`, ...(point ? { origin: { kind: "device", use: "from_here", point: { lat: point.lat, lon: point.lon } } } : {}), destination: { query: to.label, resolution: { source: "saved_place", name: to.label, point: { lat: to.lat, lon: to.lon }, placeId: to.id } } });
    router.push("/plan?for=go");
  };

  // One way back in: an open journey first, else this tab's plan, else her latest saved plan.
  const resume = useMemo(() => {
    if (journeyTo !== null) return { id: "journey", icon: "footsteps", eyebrow: "Open journey", title: journeyTo ? `On the way to ${journeyTo}` : "Your journey is open", detail: staleSpot ? "Open it to share where you are now." : "It stays open until you tap “I’m here”.", href: "/trip", aria: "Open journey" };
    const named = (d: PlanDraft) => (d.activity.trim() ? `${d.activity.trim()} · ${planTitle(d)}` : planTitle(d));
    if (tabDraft) return { id: "tab", icon: "route", eyebrow: "Resume plan · in this tab", title: named(tabDraft), detail: planLine(tabDraft), href: "/plan", aria: `Resume plan: ${named(tabDraft)}` };
    if (savedPlan) return { id: "saved", icon: "clock", eyebrow: "Resume plan · saved", title: named(savedPlan.draft), detail: `${planLine(savedPlan.draft)} · Mira checks it again when you open it`, onClick: () => { setPlanDraft({ ...savedPlan.draft, touched: true }); router.push("/plan"); }, aria: `Resume plan: ${named(savedPlan.draft)}` };
    return null;
  }, [journeyTo, staleSpot, tabDraft, savedPlan, router]);
  const usual = habit ? places.find((p) => p.id === habit.placeId) : null;

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
  useEffect(() => {
    // Text typed before the app was ready (slow phones) is kept, not wiped by hydration (audit P09-004).
    const kept = (window as { __miraEarly?: { text: Record<string, string> } }).__miraEarly?.text;
    const early = kept?.ask;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time pickup of pre-hydration input
    if (early) setAsk(early);
    // She already pressed Enter: send it now rather than make her press again (re-audit RA2).
    if (early && kept?.__submitted === "ask") { delete kept.__submitted; submitAsk(early); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at mount
  }, []);

  const t = useT();
  const firstName = user?.name.split(" ")[0];
  const askBox = useRef<HTMLInputElement>(null);
  // Examples fill the box (she can edit before asking); nothing is sent until she taps Ask Mira.
  const fillExample = (text: string) => { setAsk(text); askBox.current?.focus(); };

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        <RootHeader emailAlerts={emailAlerts} leading={<Link href="/" className="mira-wordmark" aria-label="Mira home">mira<span aria-hidden>↗</span></Link>} />

        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <p className="min-h-5 text-[0.875rem] font-semibold text-ink-muted">{clock ? `${t(greetingKey(clock.getHours()))}${firstName ? `, ${firstName}` : ""}` : ""}</p>
          {user ? (
            <div className="flex shrink-0 items-center gap-2">
              {/* Updates: a contact accepted, a journey needs you. The count clears when the inbox is opened. */}
              <Link href="/inbox" aria-label={unread ? `Updates, ${unread} new` : "Updates"} className="relative grid size-11 place-items-center rounded-full bg-surface text-ink ring-1 ring-line">
                <Icon name="bell" className="size-[18px]" />
                {unread ? <span aria-hidden className="absolute -right-0.5 -top-0.5 grid min-w-[1.125rem] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-[1.125rem] text-accent-ink ring-2 ring-canvas">{unread > 9 ? "9+" : unread}</span> : null}
              </Link>
              <Link href="/me" aria-label="Your profile and settings" className="grid size-11 place-items-center"><Avatar name={user.name} src={user.avatarUrl} size={40} /></Link>
            </div>
          ) : (
            <button type="button" onClick={() => setSignIn(true)} className="m-link shrink-0 px-1">Sign in</button>
          )}
        </div>

        {/* Purpose first, in Mira's voice: what she helps with and where to begin. */}
        <h1 className="m-voice text-[clamp(1.875rem,9vw,2.5rem)]">{t("home.purpose")}</h1>
        <p className="mt-1.5 max-w-[34ch] text-[0.9375rem] leading-snug text-ink-muted">{t("home.purposeLine")}</p>

        {/* 1. The primary task: say it in her own words. Works before the app has loaded (early-input capture). */}
        <form onSubmit={(e) => { e.preventDefault(); submitAsk(ask); }} className="m-card mt-4 p-3.5">
          <label htmlFor="home-ask" className="block font-semibold leading-snug">Where are you heading or what would you like to know?</label>
          <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-sunken p-1.5 pl-3.5 ring-1 ring-transparent focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent">
            <input ref={askBox} id="home-ask" data-early-text="ask" value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={1000} placeholder="A run at 5 AM, heading home, a new neighbourhood…" autoComplete="off" enterKeyHint="send" className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-subtle" />
            <button type="submit" disabled={!ask.trim()} className="mira-primary min-h-11 shrink-0 px-4 text-sm">Ask Mira</button>
          </div>
          <div className="m-scroll-x -mx-3.5 mt-1.5 px-3.5" role="group" aria-label="Examples you can edit before asking">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => fillExample(e)} className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-medium text-ink-muted ring-1 ring-inset ring-line hover:bg-sunken">{e}</button>
            ))}
          </div>
        </form>

        {/* 2. The two structured paths — each says what she gets — then the presets. No model needed. */}
        <StartChoices className="mt-5" />

        {/* 3. One way back in. A plan is never being followed; only an open journey is. */}
        {resume ? (
          <ul className="mt-5">
            <Row icon={resume.icon} tone={resume.id === "journey" ? "dusk" : "accent"} eyebrow={resume.eyebrow} title={resume.title} detail={resume.detail} href={"href" in resume ? resume.href : undefined} onClick={"onClick" in resume ? resume.onClick : undefined} ariaLabel={resume.aria} />
          </ul>
        ) : null}

        {usual && habit ? (
          <RowList label={t("home.noticed")} id="noticed-h" className="mt-6">
            <Row icon="route" tone="accent" kind="checked" eyebrow="Your usual" title={`${usual.label} around now`} detail={`${habit.times} of your journeys at this hour · from your own history`} onClick={() => startPlanTo(usual)} ariaLabel={`Your usual: ${usual.label} around now`} />
          </RowList>
        ) : null}

        {/* 4. Only after she chose location: what's true around her now, with its evidence one tap away. */}
        {point ? (
          <div className="mt-6">
            <LiveNowCard now={clock} point={{ lat: point.lat, lon: point.lon }} area={loc.area} stats={[]} line={line} locating={false} locationState={loc.status} onLocate={() => undefined} />
          </div>
        ) : null}

        <p className="mt-8 px-1 text-center text-[0.75rem] leading-relaxed text-ink-subtle">Mira asks only for what it needs, and nothing starts or is shared until you choose. It never scores a place: every fact shows where it came from, and what Mira can’t see is said too.</p>
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to save plans and go with Mira" />
    </div>
  );
}
