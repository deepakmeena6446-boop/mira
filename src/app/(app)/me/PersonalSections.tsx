"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/app/Section";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Chip, GroupRow, Toggle } from "@/components/mira/Rows";
import { api } from "@/lib/api-client";
import { resetLocalPersonalisation } from "@/lib/usage-signal";
import { MODE_WORDS, TRAVEL_MODES, type TravelMode, type TravelPrefs } from "@/domain/travel-prefs";
import type { HabitView } from "@/server/account/habits";

type Prefs = { prefs: TravelPrefs; rememberHabits: boolean; pausedLegacyHabits: boolean };

/**
 * Personalisation she can see and undo: her travel preference, and what Mira remembers from
 * finished journeys to her saved places (never anything else, never coordinates).
 */
export function PersonalSections() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [habits, setHabits] = useState<HabitView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);

  useEffect(() => {
    void Promise.all([api<Prefs>("/api/me/prefs"), api<{ habits: HabitView[] }>("/api/me/habits")]).then(([p, h]) => {
      if (p.ok) setPrefs(p.data);
      if (h.ok) setHabits(h.data.habits);
      if (!p.ok || !h.ok) setFailed(true);
    });
  }, []);

  const patch = async (body: { mode?: TravelMode | null; rememberHabits?: boolean }, key: string) => {
    setBusy(key);
    const r = await api<Prefs>("/api/me/prefs", { method: "PATCH", body });
    setBusy(null);
    if (!r.ok) return toast(r.message, "error");
    setPrefs(r.data);
    if (body.rememberHabits === false) setHabits([]);
  };

  const forget = async () => {
    setBusy("forget");
    const r = await api("/api/me/habits", { method: "DELETE" });
    setBusy(null);
    setConfirmForget(false);
    if (!r.ok) return toast(r.message, "error");
    setHabits([]);
    toast("Forgotten. Mira no longer remembers any of your journeys.");
  };

  const mode = prefs?.prefs.mode ?? null;
  const learning = prefs?.rememberHabits ?? false;

  return (
    <>
      <Section id="travel" title="Travel preferences">
        <div className="p-4">
          <p className="m-meta">How you usually get around. Mira starts with this when you plan; you can change it each time.</p>
          <div role="radiogroup" aria-label="Preferred way of travelling" className="mt-3 flex flex-wrap gap-2">
            {[...TRAVEL_MODES, null].map((m) => {
              const on = mode === m;
              return <Chip key={m ?? "none"} on={on} disabled={!prefs || busy === "mode"} onClick={() => { if (!on) void patch({ mode: m }, "mode"); }}>{m ? MODE_WORDS[m].label : "No preference"}</Chip>;
            })}
          </div>
        </div>
      </Section>

      <Section id="remembers" title="What Mira remembers">
        <GroupRow icon="sparkle" title="Learn from my journeys" detail="Only journeys you finish at a saved place: the place, how you went, the hour and who you shared with — never the way." end={<Toggle on={learning} label="Learn from my finished journeys to saved places" disabled={!prefs || busy === "learn"} onChange={(next) => void patch({ rememberHabits: next }, "learn")} />} />
        {prefs?.pausedLegacyHabits ? (
          <p className="px-4 py-3 text-sm text-ink-muted">Habit learning was previously on by default. Mira has paused learning and suggestions. Your earlier habit summaries remain below for review. Turn this on to use them, or choose Forget all to delete them.</p>
        ) : null}
        {habits && habits.length ? (
          <>
            {habits.map((h) => <GroupRow key={`${h.placeId}-${h.mode}-${h.startHour}`} art={<span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-base">{h.emoji}</span>} title={h.text} />)}
            <div className="px-4 py-3">
              {confirmForget ? (
                <div>
                  <p className="text-sm font-semibold">Forget all of this? Mira won&apos;t suggest anything from it again.</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="danger" busy={busy === "forget"} onClick={forget}>
                      Forget all
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmForget(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmForget(true)} className="min-h-11 text-sm font-semibold text-ink-muted hover:text-ink">
                  Forget all
                </button>
              )}
            </div>
          </>
        ) : habits && learning ? (
          <p className="px-4 py-3 text-sm text-ink-muted">Nothing yet. After a few journeys to a saved place, you&apos;ll see them here.</p>
        ) : null}
        {failed ? <p className="px-4 py-3 text-sm text-ink-muted">Couldn&apos;t load this right now. Check your connection and open Me again.</p> : null}
        {/* Device-local only (docs/launch-ux/07 §B): never sent to Mira; cleared here, on sign-out and on delete. */}
        <div className="px-4 py-3">
          <p className="text-sm text-ink-muted">On this phone: how you&apos;ve used Mira lately (journeys or contributions, by day only), to arrange Mira&apos;s suggestions. Never sent anywhere.</p>
          <button
            type="button"
            onClick={() => {
              resetLocalPersonalisation();
              toast("Mira suggestions are reset.");
            }}
            className="mt-1 min-h-11 text-sm font-semibold text-accent-strong"
          >
            Reset Mira suggestions
          </button>
        </div>
      </Section>
    </>
  );
}
