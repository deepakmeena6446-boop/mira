"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { StateNote } from "@/components/mira/Frame";
import { Row, RowList, type RowTone } from "@/components/mira/Rows";
import { api } from "@/lib/api-client";
import { useClock } from "@/lib/location-store";
import type { InboxItem } from "@/server/providers/notify";

const KIND: Record<string, { icon: string; tone: RowTone }> = {
  welcome: { icon: "sparkle", tone: "accent" },
  contact_accepted: { icon: "check-circle", tone: "people" },
  trip_missed: { icon: "timer", tone: "warm" },
  trip_alert_failed: { icon: "info", tone: "warm" },
  location_paused: { icon: "wifi-off", tone: "warm" },
  contribution_confirmed: { icon: "community", tone: "people" },
};

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Updates from Mira (docs/phase2-ux/00 §4): contacts accepting, missed check-ins, paused location. */
export function InboxScreen({ signedIn, initial, emailAlerts }: { signedIn: boolean; initial: InboxItem[]; emailAlerts: boolean }) {
  const router = useRouter();
  const now = useClock()?.getTime() ?? null; // null during server render: times appear after hydration
  const hasUnread = initial.some((n) => !n.read_at);
  useEffect(() => {
    // Opening the inbox reads everything; the bell on Home clears next time it loads.
    if (hasUnread) void api("/api/me/notifications", { body: {} });
  }, [hasUnread]);

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        <header className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line"><Icon name="back" className="size-5" /></button>
          <SafetyAccess emailAlerts={emailAlerts} compact quiet className="min-w-0" />
        </header>
        <h1 className="m-display mt-5">Updates</h1>
        <p className="mt-1 text-[0.95rem] text-ink-muted">When someone accepts your invite, or a journey needs you. Never anything about where you are.</p>

        {!signedIn ? (
          <StateNote className="mt-6" title="Sign in for updates">Mira tells you here about your journeys and the people in your Circle.</StateNote>
        ) : initial.length === 0 ? (
          <StateNote className="mt-6" title="All quiet">I’ll let you know here when a contact accepts, or if something needs your attention on a journey.</StateNote>
        ) : (
          <RowList label={hasUnread ? `${initial.filter((n) => !n.read_at).length} new` : "Latest"} id="updates-h" className="mt-7">
            {initial.map((n) => {
              const k = KIND[n.kind] ?? { icon: "info", tone: "ink" as RowTone };
              return <Row key={n.id} icon={k.icon} tone={k.tone} eyebrow={now ? ago(n.created_at, now) : " "} title={n.title} detail={n.body} wrap mark={!n.read_at} href={n.href ?? undefined} />;
            })}
          </RowList>
        )}
      </div>
    </div>
  );
}
