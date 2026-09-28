"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/app/Section";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { MODE_WORDS, TRAVEL_MODES, type TravelMode, type TravelPrefs } from "@/domain/travel-prefs";
import type { HabitView } from "@/server/account/habits";

/** Circle isn't a tab: it's the first row in Me. */
export function CircleRow({ accepted, invited }: { accepted: number; invited: number }) {
  return (
    <Link href="/circle" className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] bg-surface px-5 py-3 shadow-[var(--shadow-card)] hover:bg-sunken">
      <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon name="heart" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Your circle</span>
        <span className="block text-sm text-ink-muted">
          {accepted ? `${accepted} ${accepted === 1 ? "person follows" : "people follow"} your journeys when you share` : "Add the people who should know you got there"}
          {invited ? ` · ${invited} invited` : ""}
        </span>
      </span>
      <Icon name="chevron" className="size-4 text-ink-subtle" />
    </Link>
  );
}

type Prefs = { prefs: TravelPrefs; rememberHabits: boolean };

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
      if (p.ok) setPrefs({ prefs: p.data.prefs, rememberHabits: p.data.rememberHabits });
      if (h.ok) setHabits(h.data.habits);
      if (!p.ok || !h.ok) setFailed(true);
    });
  }, []);

  const patch = async (body: { mode?: TravelMode | null; rememberHabits?: boolean }, key: string) => {
    setBusy(key);
    const r = await api<Prefs>("/api/me/prefs", { method: "PATCH", body });
    setBusy(null);
    if (!r.ok) return toast(r.message, "error");
    setPrefs({ prefs: r.data.prefs, rememberHabits: r.data.rememberHabits });
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
        <div className="p-5">
          <p className="text-sm text-ink-muted">How you usually get around. Mira starts with this when you plan a journey; you can change it each time.</p>
          <div role="radiogroup" aria-label="Preferred way of travelling" className="mt-3 grid grid-cols-2 gap-2">
            {[...TRAVEL_MODES, null].map((m) => {
              const on = mode === m;
              return (
                <button
                  key={m ?? "none"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!prefs || busy === "mode"}
                  onClick={() => !on && patch({ mode: m }, "mode")}
                  className={cx("min-h-12 rounded-2xl border-2 px-3 text-left text-sm font-bold disabled:opacity-60", on ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-muted")}
                >
                  {m ? MODE_WORDS[m].label : "No preference"}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section id="remembers" title="What Mira remembers">
        <div className="p-5">
          <p className="text-sm text-ink-muted">
            When a journey to one of your saved places ends with you arriving, Mira counts it: the place, how you travelled, the hour you left and who you shared it with. Nothing about any other journey, and never where you went on the way.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={learning}
            disabled={!prefs || busy === "learn"}
            onClick={() => patch({ rememberHabits: !learning }, "learn")}
            className="mt-4 flex min-h-12 w-full items-center gap-3 text-left disabled:opacity-60"
          >
            <span className="flex-1 font-semibold">Learn from my finished journeys to saved places</span>
            <span aria-hidden className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", learning ? "bg-accent" : "bg-line-strong")}>
              <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", learning ? "left-6" : "left-1")} />
            </span>
          </button>
          {prefs && !learning ? <p className="mt-1 text-sm text-ink-subtle">Off. Mira remembers nothing about your journeys.</p> : null}
        </div>
        {habits && habits.length ? (
          <>
            <ul className="divide-y divide-line border-t border-line">
              {habits.map((h) => (
                <li key={`${h.placeId}-${h.mode}-${h.startHour}`} className="flex items-center gap-3 px-5 py-3">
                  <span aria-hidden className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-lg">
                    {h.emoji}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold">{h.text}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-4">
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
                <button type="button" onClick={() => setConfirmForget(true)} className="min-h-11 text-sm font-bold text-ink-muted hover:text-ink">
                  Forget all
                </button>
              )}
            </div>
          </>
        ) : habits && learning ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">Nothing yet. After a few journeys to a saved place, you&apos;ll see them here.</p>
        ) : null}
        {failed ? <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">Couldn&apos;t load this right now. Check your connection and open Me again.</p> : null}
      </Section>
    </>
  );
}
