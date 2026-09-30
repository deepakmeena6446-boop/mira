"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SavedPlace } from "@/server/account/places";
import type { TripView } from "@/server/trips";
import { useLocation, setPendingDestination, rememberLocationChoice, shouldAutoLocate } from "@/lib/location-store";
import { Icon } from "@/components/ui/Icon";
import { MiraPulse } from "@/components/app/MiraPulse";
import { CommunityPulse } from "@/components/app/CommunityPulse";
import { JourneyCapsule } from "@/components/app/JourneyCapsule";
import { SearchOverlay } from "@/components/app/SearchOverlay";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { SafetyUpdatesSection } from "@/components/app/SafetyUpdates";
import { api } from "@/lib/api-client";

export function TodayScreen({ name, places, trip, emailAlerts }: { name: string | null; places: SavedPlace[]; trip: TripView | null; emailAlerts: boolean }) {
  const router = useRouter();
  const loc = useLocation(false);
  const shouldRequestLocation = !loc.point;
  const requestLocationAgain = loc.request;
  const [searching, setSearching] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!name) return;
    let live = true;
    void api<{ notifications: Array<{ read_at: string | null }> }>("/api/me/notifications").then((r) => {
      if (live && r.ok) setUnread(r.data.notifications.filter((n) => !n.read_at).length);
    });
    return () => { live = false; };
  }, [name]);
  const active = trip && (trip.state === "active" || trip.state === "missed") ? trip : null;
  useEffect(() => {
    if (name) return;
    try { if (!localStorage.getItem("mira.welcomed")) router.replace("/welcome"); } catch { /* storage blocked: remain on Today */ }
  }, [name, router]);
  useEffect(() => { if (shouldRequestLocation && shouldAutoLocate()) void requestLocationAgain(); }, [shouldRequestLocation, requestLocationAgain]);
  const enableLocation = () => { rememberLocationChoice(true); void loc.request(); };
  return <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-accent-strong">Mira · Together, safer</p><h1 className="mt-1 text-[1.9rem] font-semibold">Today{name ? `, ${name.split(" ")[0]}` : ""}</h1></div>
        <div className="flex items-center gap-2">
          {name ? <Link href="/inbox" aria-label={unread ? `Updates, ${unread} new` : "Updates"} className="relative grid size-11 place-items-center rounded-full border border-line bg-surface"><Icon name="bell" />{unread ? <span aria-hidden className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-warm px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span> : null}</Link> : null}
          <MiraPulse size={28} state="observing" />
        </div>
      </header>
      {active ? <JourneyCapsule title={active.autoArrival ? `To ${active.destination.name}` : "Sharing your location"} detail={active.sharedWith.length ? `Shared with ${active.sharedWith.map((c) => c.name).join(", ")}` : "Live link ready · no one alerted automatically"} attention={active.state === "missed"} /> : null}
      <div className="mira-today-hero rounded-[var(--radius-lg)] p-5">
        <p className="text-sm font-semibold text-warm night:text-[#f3c698]">Your everyday safety companion</p>
        <p className="mt-2 max-w-sm text-xl font-semibold leading-snug">Know a place. Go with support. Help the next person.</p>
        <button type="button" onClick={() => setSearching(true)} className="mt-5 flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-control)] bg-accent px-4 text-left font-semibold text-accent-ink"><Icon name="search" className="size-5" /> Check a place <Icon name="arrow" className="ml-auto size-4" /></button>
      </div>
      <SafetyAccess emailAlerts={emailAlerts} />
      <Link href="/mira" className="flex min-h-16 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface px-4"><span className="grid size-10 place-items-center rounded-full bg-warm-soft text-warm"><Icon name="sparkle" /></span><span className="flex-1"><strong className="block">Ask Mira</strong><span className="text-sm text-ink-muted">A question, a plan, or help right now</span></span><Icon name="chevron" className="size-4 text-ink-subtle" /></Link>
      <CommunityPulse point={loc.point} compact />
      {!loc.point ? <button type="button" onClick={enableLocation} className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-semibold"><Icon name="locate" className="size-4" /> {loc.status === "denied" ? "Location is off for Mira · try again" : "Use my location for local context"}</button> : null}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/trips" className="rounded-[var(--radius-card)] border border-line bg-surface p-4"><Icon name="route" className="text-accent" /><strong className="mt-2 block">Your journeys</strong><span className="text-sm text-ink-muted">Plan or revisit</span></Link>
        <Link href="/contribute" className="rounded-[var(--radius-card)] border border-line bg-surface p-4"><Icon name="community" className="text-accent" /><strong className="mt-2 block">Your impact</strong><span className="text-sm text-ink-muted">Checks, Scout and more</span></Link>
      </div>
      <Link href="/circle" className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-semibold"><Icon name="user" className="size-4 text-accent" /> Your Circle <Icon name="chevron" className="ml-auto size-4 text-ink-subtle" /></Link>
      <SafetyUpdatesSection point={loc.point} heading="Official & news updates" />
    </div>
    <SearchOverlay open={searching} onClose={() => setSearching(false)} onPick={(d) => { setPendingDestination(d); router.push("/around"); }} saved={places} near={loc.point} placeholder="Check a place" />
  </div>;
}
