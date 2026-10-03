"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { outcomeMessage, type ContributionOutcome } from "@/components/app/CheckCard";
import { api } from "@/lib/api-client";
import { recordUsage } from "@/lib/usage-signal";
import type { Category } from "@/domain/report/taxonomy";

type Check = { id: string; question: string; placeName: string; options: Array<{ value: string; label: string }> };

/** Everyday observations first (anyone can make them), then what happened. Each opens the report pre-filled. */
const QUICK: Array<{ c: Category; icon: string; label: string; tone: "dusk" | "people" | "ink" }> = [
  { c: "environment", icon: "lamp", label: "Dark or broken street", tone: "dusk" },
  { c: "positive_condition", icon: "sun", label: "Something good here", tone: "people" },
  { c: "transport_issue", icon: "bus", label: "Transport problem", tone: "ink" },
  { c: "other", icon: "flag", label: "Something happened", tone: "ink" },
];

/**
 * "Help the next person here": contribution as a one-tap habit on Home, not a destination. A waiting
 * Mira Check is answered inline; a quick observation opens the private report with this spot and the
 * category already chosen. Impact is counted from her own receipts only (never a leaderboard).
 */
export function HelpNextCard({ check, impactLine, signedIn, country }: { check: Check | null; impactLine: string | null; signedIn: boolean; country: string | null }) {
  const router = useRouter();
  const [answered, setAnswered] = useState<{ text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const answer = async (value: string) => {
    if (!check || busy) return;
    setBusy(value);
    const r = await api<{ recorded: boolean; outcome: ContributionOutcome | null }>(`/api/contribute/check/${check.id}`, { body: { answer: value, country } });
    setBusy(null);
    if (r.ok) recordUsage("check");
    setAnswered({ text: r.ok ? (r.data.outcome ? outcomeMessage(r.data.outcome, r.data.recorded) : outcomeMessage("pending" as ContributionOutcome, r.data.recorded)) : r.message });
  };
  // The report screen uses her live position ("Around where you are now"); no spot is handed over.
  const report = (c: Category) => router.push(`/report?c=${c}&from=home`);

  return (
    <section aria-labelledby="help-next-h" className="rounded-[1.5rem] bg-people-soft/45 px-4 pb-3.5 pt-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="help-next-h" className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Add what you see here</h2>
        <p className="shrink-0 text-xs font-medium text-people">One tap · private</p>
      </div>

      {check ? (
        <div className="mt-3 rounded-2xl bg-surface p-3.5">
          <p className="m-label inline-flex items-center gap-1.5"><Icon name="check" className="size-3.5 text-people" />A Mira Check from your last walk</p>
          <p className="mt-1 font-semibold">{check.question}</p>
          {answered ? (
            <p role="status" className="mt-2 text-sm text-ink-muted">{answered.text}</p>
          ) : (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {check.options.map((o) => (
                <button key={o.value} type="button" disabled={Boolean(busy)} onClick={() => void answer(o.value)} className={cx("min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong", busy === o.value ? "bg-people text-white" : "bg-surface")}>{o.label}</button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="m-scroll-x -mx-4 mt-3 px-4 pb-0.5">
        {QUICK.map((q) => (
          <button key={q.c} type="button" onClick={() => report(q.c)} className="m-press flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-surface py-2 pl-3 pr-4 text-[0.8125rem] font-semibold shadow-[0_1px_2px_rgb(20_33_61/.06)]">
            <Icon name={q.icon} className={cx("size-[18px]", q.tone === "dusk" ? "text-dusk" : q.tone === "people" ? "text-people" : "text-ink-muted")} />
            {q.label}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-[0.72rem] leading-snug text-ink-subtle">
        {impactLine ? <><strong className="font-semibold text-ink">{impactLine}</strong> </> : null}
        {signedIn ? "It helps the next person. Only what several people agree on ever shows as a note." : "No account needed. It helps the next person, and is never shown as-is."}
      </p>
    </section>
  );
}
