"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RootHeader, StateNote } from "@/components/mira/Frame";
import { JourneyGlance } from "@/components/mira/JourneyGlance";
import { Row, RowAction, RowList } from "@/components/mira/Rows";
import { SituationChips } from "@/components/mira/Situations";
import { SignInSheet } from "@/components/app/SignInSheet";
import { api } from "@/lib/api-client";
import { useClock } from "@/lib/location-store";
import { useLocalJourneyActive } from "@/lib/local-check-in-store";
import { setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import { hasPlanWork, type PlanDraft } from "@/domain/plan-state";
import { placeName, planLine, planStartsAt, planTitle } from "@/domain/plan-name";
import { modeWords } from "@/domain/travel-prefs";
import type { TripSummary, TripView } from "@/server/trips";
import { clockIn } from "@/domain/daylight";
import { LEFT_NOTE } from "./left-note";

type Saved = { id: string; draft: PlanDraft; createdAt: string; expiresAt: string };

const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const CLOSED: Record<string, { word: string; icon: string }> = {
  arrived: { word: "Arrived", icon: "check-circle" },
  ended: { word: "Ended", icon: "flag" },
  expired: { word: "Closed", icon: "clock" },
};
/** The same clock as every other screen ("11:21 PM"); the zone is named only when it isn't the phone's. */
function clockAt(iso: string, tz: string | null): string {
  let device = "";
  try { device = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* unnamed */ }
  const zone = tz ?? "UTC";
  const t = clockIn(iso, zone);
  if (zone === device) return t;
  const abbr = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value;
  return abbr ? `${t} ${abbr}` : t;
}

/**
 * Journeys (docs/phase2-ux/00): the journey you're on, then what's coming up (this tab's plan and plans
 * you saved), then what finished today. No diary, no map history — finished journeys go after a day.
 */
export function JourneysScreen({ signedIn, emailAlerts, active, recent }: { signedIn: boolean; emailAlerts: boolean; active: TripView | null; recent: TripSummary[] }) {
  const router = useRouter();
  const clock = useClock();
  const draft = usePlanDraft();
  const privateCheckIn = useLocalJourneyActive();
  const [saved, setSaved] = useState<{ plans: Saved[] | null; failed: string | null }>({ plans: signedIn ? null : [], failed: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [leftNote, setLeftNote] = useState(false);
  useEffect(() => {
    let note = false;
    try { note = sessionStorage.getItem(LEFT_NOTE) === "1"; sessionStorage.removeItem(LEFT_NOTE); } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read a one-time note left by the journey screen
    if (note) setLeftNote(true);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void api<{ plans: Saved[] }>("/api/me/plans").then((r) => { if (live) setSaved(r.ok ? { plans: r.data.plans, failed: null } : { plans: [], failed: r.network ? "You’re offline. Saved plans show again when you’re connected." : "Couldn’t load your saved plans just now." }); });
    return () => { live = false; };
  }, [signedIn]);

  const remove = async (id: string) => {
    setBusy(id);
    const r = await api<{ deleted: boolean }>(`/api/me/plans/${id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) setSaved((s) => ({ ...s, plans: s.plans?.filter((p) => p.id !== id) ?? [] }));
    else setSaved((s) => ({ ...s, failed: r.message }));
    return r.ok;
  };
  const open = (plan: Saved) => { setPlanDraft({ ...plan.draft, touched: true }); router.push("/plan"); };

  // The tab's plan, unless it is the journey already running (that one is shown under Now).
  const tabPlan = hasPlanWork(draft) && draft && !(active && placeName(draft.destination) === active.destination.name) ? draft : null;
  const tabStarts = tabPlan ? planStartsAt(tabPlan) : null;
  const tabPassed = tabStarts !== null && clock !== null && tabStarts < clock.getTime() - 15 * 60_000;
  // A saved plan already open in this tab is listed once, as the tab's plan.
  const savedList = (saved.plans ?? []).filter((p) => p.id !== tabPlan?.savedId).sort((a, b) => (planStartsAt(a.draft) ?? Infinity) - (planStartsAt(b.draft) ?? Infinity));
  const upcomingEmpty = !tabPlan && saved.plans !== null && savedList.length === 0 && !saved.failed;

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        <RootHeader title="Journeys" emailAlerts={emailAlerts} eyebrow="Now, coming up, and the last day" />
        {leftNote ? (
          <p role="status" className="mt-4 m-card px-4 py-3 text-sm">
            {signedIn ? "Your journey was closed on another device. Nothing is being shared, and nobody will be alerted." : "You're signed out here, so your journey isn't running on this device any more."}
          </p>
        ) : null}

        {/* 1. Now: the journey you're on — the same glance as the journey screen. */}
        <section aria-labelledby="now-h" className="mt-5">
          <h2 id="now-h" className="sr-only">Now</h2>
          {active ? (
            <JourneyGlance trip={{ ...active, sharing: active.sharedWith.length > 0 }} clock={clock} footer={{ label: "Open your journey", href: "/trip" }} />
          ) : privateCheckIn ? (
            <ul><Row icon="clock" eyebrow="Private check-in" title="Running in this tab" detail="On this device only · no location · nobody was told" href="/trip/local" ariaLabel="Resume private journey" /></ul>
          ) : (
            <>
              <StateNote title="No journey right now">When you go with Mira, your journey shows here until a day after you arrive.</StateNote>
              <SituationChips className="mt-2.5" />
            </>
          )}
        </section>

        {/* 2. Coming up: this tab's plan and plans you chose to save. */}
        <RowList label="Coming up" id="upcoming-h" className="mt-7">
          {tabPlan ? (
            <Row icon="route" eyebrow={[tabPlan.activity.trim() || null, tabPassed ? "Time passed · check again" : tabPlan.savedId ? "Saved · open now" : "In this tab"].filter(Boolean).join(" · ")} title={planTitle(tabPlan)} detail={planLine(tabPlan)} href="/plan" ariaLabel={`Continue plan: ${planTitle(tabPlan)}`} trailing={tabPlan.savedId ? <RowAction icon="trash" label="Delete plan" disabled={busy === tabPlan.savedId} onClick={() => { const id = tabPlan.savedId!; void remove(id).then((ok) => { if (ok) setPlanDraft({ ...tabPlan, savedId: undefined }); }); }} /> : undefined} />
          ) : null}
          {savedList.map((p) => (
            <Row key={p.id} icon="star" eyebrow={p.draft.activity.trim() || "Saved plan"} title={planTitle(p.draft)} detail={planLine(p.draft)} onClick={() => open(p)} ariaLabel={`Open plan: ${p.draft.activity.trim() || planTitle(p.draft)}`} trailing={<RowAction icon="trash" label="Delete plan" disabled={busy === p.id} onClick={() => void remove(p.id)} />} />
          ))}
        </RowList>
        {signedIn && saved.plans === null ? <StateNote className="mt-2.5">Loading saved plans…</StateNote> : null}
        {saved.failed ? <StateNote tone="attention" className="mt-2.5" title="Saved plans">{saved.failed}</StateNote> : null}
        {upcomingEmpty ? (
          signedIn
            ? <StateNote className="mt-2.5" title="No saved plans">Save a plan from its brief to keep it here for 30 days. Saving never starts or shares a journey.</StateNote>
            : <StateNote className="mt-2.5" title="Keep plans and go with Mira" action={<button type="button" onClick={() => setSignIn(true)} className="mira-primary min-h-11 px-5 text-sm">Sign in</button>}>Your private check-in works in this tab without an account. Sign in to save plans for 30 days and share your journey live.</StateNote>
        ) : null}

        {/* 3. The last 24 hours: closed journeys, kept a day at most. */}
        {signedIn ? (
          recent.length ? (
            <RowList label="Last 24 hours" id="recent-h" className="mt-7">
              {recent.map((t) => {
                const c = CLOSED[t.state] ?? { word: "Finished", icon: "check" };
                const mode = t.autoArrival && t.mode !== "other" ? modeWords(t.mode).short : null;
                return <Row key={t.id} icon={c.icon} tone="ink" eyebrow={`${c.word} ${t.closedAt ? clockAt(t.closedAt, t.tz) : ""}`} title={t.autoArrival ? t.destination : "Shared where you were"} detail={[mode, t.sharedWith.length ? `shared with ${names(t.sharedWith)}` : "just you"].filter(Boolean).join(" · ")} />;
              })}
            </RowList>
          ) : (
            <RowList label="Last 24 hours" id="recent-h" className="mt-7"><li><StateNote>No finished journeys in the last day.</StateNote></li></RowList>
          )
        ) : null}

        <p className="mt-8 px-1 text-center text-[0.72rem] leading-relaxed text-ink-subtle">Plans in this tab last 2 hours; saved plans, 30 days. Finished journeys are deleted after a day — no travel diary, no map of where you’ve been.</p>
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to save plans and go with Mira" />
    </div>
  );
}
