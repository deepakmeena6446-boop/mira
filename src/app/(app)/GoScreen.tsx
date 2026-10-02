"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { JourneyCapsule } from "@/components/app/JourneyCapsule";
import { api } from "@/lib/api-client";
import { hasPlanWork, intentFromDraft } from "@/domain/plan-state";
import { setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import type { TripView } from "@/server/trips";
import type { SavedPlan } from "@/server/account/saved-plans";

/** V1 Go entry: one movement decision, with map and Ask in the plan context. */
export function GoScreen({ name, trip, savedPlan, emailAlerts }: { name: string | null; trip: TripView | null; savedPlan: SavedPlan | null; emailAlerts: boolean }) {
  const router = useRouter();
  const draft = usePlanDraft();
  const plan = draft ? intentFromDraft(draft) : null;
  const hasPlan = hasPlanWork(draft);
  const active = trip && (trip.state === "active" || trip.state === "missed") ? trip : null;
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (name) return;
    try { if (!localStorage.getItem("mira.welcomed")) router.replace("/welcome"); } catch { /* storage unavailable: remain on Go */ }
  }, [name, router]);
  useEffect(() => {
    if (!name) return;
    let live = true;
    void api<{ notifications: Array<{ read_at: string | null }> }>("/api/me/notifications").then((result) => {
      if (live && result.ok) setUnread(result.data.notifications.filter((n) => !n.read_at).length);
    });
    return () => { live = false; };
  }, [name]);
  return <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-accent-strong">Mira</p><h1 className="mt-1 text-[1.9rem] font-semibold">Go{name ? `, ${name.split(" ")[0]}` : ""}</h1></div>{name ? <Link href="/inbox" aria-label={unread ? `Updates, ${unread} new` : "Updates"} className="relative grid size-11 place-items-center rounded-full border border-line bg-surface"><Icon name="bell" />{unread ? <span aria-hidden className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-warm px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span> : null}</Link> : null}</header>
      {active ? <section aria-label="Active journey" className="space-y-3"><h2 className="text-lg font-semibold">Your journey is active</h2><JourneyCapsule large attention={active.state === "missed"} title={active.autoArrival ? `To ${active.destination.name}` : "Sharing your location"} detail={active.sharedWith.length ? `Shared with ${active.sharedWith.map((contact) => contact.name).join(", ")}` : "No one alerted automatically"} /><p className="text-sm text-ink-muted">Open it for last location update, change, contact and Emergency actions.</p></section> : null}
      <SafetyAccess emailAlerts={emailAlerts} />
      <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5" aria-label="Go plan">
        <h2 className="text-xl font-semibold">{hasPlan ? "Continue your movement plan" : "Where are you going?"}</h2>
        {hasPlan ? <p className="mt-2 text-sm text-ink-muted">{plan ? `${plan.activity} · ${plan.origin.kind === "device" ? "From here" : plan.origin.query}${plan.loop ? " · loop" : ` → ${plan.destination?.query}`} · ${plan.departure.local} (${plan.departure.timeZone})` : `${draft?.activity.trim() || "Your plan"} · still being entered`}{draft?.legs?.length ? ` · ${draft.legs.length} more travel leg${draft.legs.length === 1 ? "" : "s"}` : ""}</p> : <p className="mt-2 text-sm text-ink-muted">Start with a place and time, including a named origin in another city. Location permission and sign-in are optional for planning.</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Link href="/plan" className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-accent-ink"><Icon name="route" className="size-5" />{hasPlan ? "Edit or continue plan" : "Plan a movement"}</Link><Link href="/mira" className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 font-semibold"><Icon name="sparkle" className="size-5" />Ask Mira</Link></div>
        {hasPlan ? <Link href="/around" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-strong">Review options <Icon name="chevron" className="size-4" /></Link> : null}
      </section>
      {!active && savedPlan ? <section aria-label="Recent saved plan" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="font-semibold">Your saved plan</h2>
        <p className="mt-1 text-sm text-ink-muted">{savedPlan.draft.activity} · {savedPlan.draft.origin.kind === "named" ? savedPlan.draft.origin.query : "Named origin"}{savedPlan.draft.loop ? " · loop" : ` → ${savedPlan.draft.destination.query}`}</p>
        <p className="mt-1 text-xs text-ink-muted">Opening a copy does not start a journey or tell anyone. Check current evidence before going.</p>
        <button type="button" onClick={() => { setPlanDraft({ ...savedPlan.draft, touched: true }); router.push("/plan"); }} className="mt-2 min-h-11 text-sm font-semibold text-accent-strong">Open saved plan</button>
      </section> : null}
      <Link href="/around/map" className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4"><Icon name="pin" className="size-5 text-accent" /><span className="flex-1"><strong className="block">Open map</strong><span className="text-sm text-ink-muted">See a place and its available route facts</span></span><Icon name="chevron" className="size-4" /></Link>
      <Link href="/trips" className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4"><Icon name="route" className="size-5 text-accent" /><span className="flex-1"><strong className="block">Journeys</strong><span className="text-sm text-ink-muted">Active and recent journeys</span></span><Icon name="chevron" className="size-4" /></Link>
    </div>
  </div>;
}
