"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { useClock } from "@/lib/location-store";
import type { InboxItem } from "@/server/providers/notify";

const EMOJI: Record<string, string> = {
  welcome: "✨",
  contact_accepted: "🤝",
  trip_missed: "⏰",
  location_paused: "📡",
};

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Updates from Mira: contacts accepting, missed check-ins, paused location. */
export function InboxScreen({ signedIn, initial }: { signedIn: boolean; initial: InboxItem[] }) {
  const router = useRouter();
  const now = useClock()?.getTime() ?? null; // null during server render: times appear after hydration
  const hasUnread = initial.some((n) => !n.read_at);
  useEffect(() => {
    // Opening the inbox reads everything; the badge on Home clears next time it loads.
    if (hasUnread) void api("/api/me/notifications", { body: {} });
  }, [hasUnread]);

  return (
    <div className="bg-companion min-h-dvh px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-xl">
        <header className="flex items-center gap-3 py-2">
          <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Back" className="grid size-11 place-items-center rounded-full bg-surface shadow-[var(--shadow-card)]">
            <Icon name="back" className="size-5" />
          </button>
          <h1 className="text-2xl font-extrabold">Updates</h1>
        </header>

        {!signedIn ? (
          <p className="mt-6 text-ink-muted">Sign in to get updates from Mira about your trips and trusted contacts.</p>
        ) : initial.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center animate-rise">
            <MiraOrb size={64} calm />
            <p className="mt-4 text-lg font-bold">All quiet</p>
            <p className="mt-1 max-w-xs text-ink-muted">I&apos;ll let you know here when a contact accepts, or if something needs your attention on a trip.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {initial.map((n) => {
              const body = (
                <div className="flex gap-3">
                  <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-xl">
                    {EMOJI[n.kind] ?? "💬"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-bold leading-snug">{n.title}</span>
                      <span className="shrink-0 text-xs text-ink-subtle">{now ? ago(n.created_at, now) : ""}</span>
                    </p>
                    <p className="text-sm text-ink-muted text-mixed">{n.body}</p>
                  </div>
                  {!n.read_at ? <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-accent" aria-label="New" /> : null}
                </div>
              );
              const cls = cx("block rounded-3xl bg-surface p-4 shadow-[var(--shadow-card)] animate-rise", !n.read_at && "ring-2 ring-accent/30");
              return <li key={n.id}>{n.href ? <Link href={n.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
