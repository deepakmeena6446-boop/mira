"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { freshLocation, takePendingReportSpot, useLocation } from "@/lib/location-store";
import { SearchOverlay } from "@/components/app/SearchOverlay";
import { PII_LABEL, detectPii } from "@/domain/report/text";
import type { Category } from "@/domain/report/taxonomy";

const TILES: Array<{ category: Category; emoji: string; label: string; tone: string }> = [
  { category: "harassment", emoji: "😣", label: "Harassment", tone: "from-rose-50 to-orange-50 night:from-sunken night:to-surface" },
  { category: "following_stalking", emoji: "👣", label: "Being followed", tone: "from-violet-50 to-fuchsia-50 night:from-sunken night:to-surface" },
  { category: "unwanted_touching", emoji: "✋", label: "Unwanted touch", tone: "from-amber-50 to-rose-50 night:from-sunken night:to-surface" },
  { category: "environment", emoji: "💡", label: "Dark or broken street", tone: "from-sky-50 to-indigo-50 night:from-sunken night:to-surface" },
  { category: "transport_issue", emoji: "🚌", label: "Transport problem", tone: "from-teal-50 to-sky-50 night:from-sunken night:to-surface" },
  { category: "positive_condition", emoji: "💜", label: "Something good", tone: "from-emerald-50 to-teal-50 night:from-sunken night:to-surface" },
];

const WHEN = [
  { value: "now", label: "Just now" },
  { value: "today", label: "Earlier today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "past_week", label: "This week" },
] as const;

function bandFor(d: Date): "day" | "evening" | "late" {
  const h = d.getHours();
  return h >= 6 && h < 18 ? "day" : h >= 18 && h < 22 ? "evening" : "late";
}

export function ReportScreen({ preset }: { preset: Category | null }) {
  const router = useRouter();
  const loc = useLocation(true);
  // A spot long-pressed on the map, handed over in memory (never via the URL).
  const [spot, setSpot] = useState(() => takePendingReportSpot());
  const [choosing, setChoosing] = useState(false); // location off: pick the place by search instead
  const point = spot ?? loc.point;
  const [category, setCategory] = useState<Category | null>(preset);
  const [when, setWhen] = useState<(typeof WHEN)[number]["value"]>("now");
  const [involvement, setInvolvement] = useState<"experienced" | "witnessed">("experienced");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef("");
  useEffect(() => {
    keyRef.current = crypto.randomUUID();
  }, [category]);
  const pii = useMemo(() => detectPii(note), [note]);
  const tile = TILES.find((t) => t.category === category) ?? (category === "other" ? { category: "other" as Category, emoji: "💬", label: "Something else", tone: "" } : null);

  const send = async () => {
    if (!category || busy) return;
    setBusy(true);
    setError(null);
    // A picked spot is used as is; "here" is refreshed if the last fix is old.
    const where = spot ?? (await freshLocation()).point;
    if (!where) {
      setBusy(false);
      return setError("Turn on location, or choose where it happened.");
    }
    const now = new Date();
    const r = await api("/api/reports", {
      body: {
        idempotencyKey: keyRef.current,
        involvement,
        category,
        location: { lat: where.lat, lon: where.lon },
        recency: when === "now" ? "today" : when,
        // Only "just now" knows the time of day; "earlier today" could have been any time.
        timeBand: when === "now" ? bandFor(now) : "unsure",
        narrative: note,
      },
    });
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.network ? "Not sent — check your connection. Your note is still here." : r.message);
  };

  if (done) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-32 text-center">
        <MiraOrb size={84} />
        <h1 className="mt-6 text-3xl font-extrabold animate-rise">Thank you 💜</h1>
        <p className="mt-2 max-w-sm text-ink-muted animate-rise">
          Your report is private. A person reviews it, and it only ever shows up as a combined, anonymous note once enough people have seen the same thing.
        </p>
        <p className="mt-2 max-w-sm text-sm text-ink-muted">
          If you&apos;re in danger right now,{" "}
          <a href="tel:112" className="font-bold text-ink underline">
            call 112
          </a>{" "}
          or your local emergency number.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button variant="hero" size="lg" onClick={() => router.push("/")}>
            Back to map
          </Button>
          <Button variant="secondary" onClick={() => { setDone(false); setCategory(null); setNote(""); }}>
            Report something else
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-companion min-h-dvh px-4 pb-36 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-xl">
        {!tile ? (
          <div className="animate-rise">
            <h1 className="text-3xl font-extrabold">What happened?</h1>
            <p className="mt-1 text-ink-muted">
              {spot ? `Reporting ${spot.name ? spot.name.replace(/^Near /, "near ") : "the spot you picked on the map"}. ` : ""}Private and anonymous. It helps others know what&apos;s been noticed around here.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {TILES.map((t) => (
                <button
                  key={t.category}
                  type="button"
                  onClick={() => setCategory(t.category)}
                  className={cx("flex min-h-32 flex-col items-start justify-between rounded-[1.6rem] bg-gradient-to-br p-4 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.97]", t.tone)}
                >
                  <span className="text-4xl" aria-hidden>
                    {t.emoji}
                  </span>
                  <span className="text-lg font-extrabold leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setCategory("other")} className="mt-4 min-h-11 w-full rounded-full text-sm font-bold text-accent hover:bg-accent-soft">
              Something else
            </button>
            {spot ? null : <p className="mt-2 text-center text-sm text-ink-subtle">Tip: on the map, press and hold a spot to report it.</p>}
          </div>
        ) : (
          <div className="animate-rise">
            <button type="button" onClick={() => setCategory(null)} className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 font-bold text-ink-muted">
              <Icon name="back" className="size-5" /> Back
            </button>
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-2xl bg-surface text-3xl shadow-[var(--shadow-card)]">{tile.emoji}</span>
              <h1 className="text-2xl font-extrabold">{tile.label}</h1>
            </div>

            <section className="mt-6 rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
              <p className="flex items-center gap-2 font-bold">
                <Icon name="pin" className="size-5 text-accent" />
                {spot ? (spot.name ? `Near ${spot.name.replace(/^Near /, "")}` : "The spot you picked on the map") : loc.point ? "Around where you are now" : loc.status === "asking" ? "Finding you…" : "Location is off"}
              </p>
              {spot ? (
                <button type="button" onClick={() => setSpot(null)} className="mt-1 min-h-11 text-sm font-bold text-accent">
                  Use where I am instead
                </button>
              ) : !loc.point && loc.status !== "asking" ? (
                <button type="button" onClick={() => setChoosing(true)} className="mt-2 min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-ink">
                  Choose where it happened
                </button>
              ) : null}
              <p className="mt-1 text-sm text-ink-muted">Only a rough area (about 1 km) is kept — never the exact spot.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {WHEN.map((w) => (
                  <button key={w.value} type="button" onClick={() => setWhen(w.value)} aria-pressed={when === w.value} className={cx("min-h-11 rounded-full border px-4 text-sm font-bold", when === w.value ? "border-accent bg-accent text-accent-ink" : "border-line")}>
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 inline-flex rounded-full bg-sunken p-1">
                {(["experienced", "witnessed"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setInvolvement(v)} aria-pressed={involvement === v} className={cx("min-h-11 rounded-full px-4 text-sm font-bold", involvement === v ? "bg-surface shadow" : "text-ink-muted")}>
                    {v === "experienced" ? "It happened to me" : "I saw it"}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
              <label htmlFor="note" className="font-bold">
                Anything to add? <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="What did you notice? Leave out names, numbers and plates."
                className="mt-2 w-full resize-none rounded-2xl border border-line bg-sunken px-4 py-3 outline-none focus:border-accent focus:bg-surface text-mixed"
              />
              {pii.length ? (
                <p className="mt-2 rounded-2xl bg-warm-soft px-3 py-2 text-sm text-warm">
                  This looks like it includes a {[...new Set(pii.map((p) => PII_LABEL[p.type]))].join(", ")}. Please remove it — if you send it as is, it stays private and won&apos;t be shared.
                </p>
              ) : null}
            </section>

            {error ? (
              <p role="alert" className="mt-4 rounded-2xl bg-error-soft px-4 py-3 text-sm font-semibold text-error">
                {error}
              </p>
            ) : null}
            <Button className="mt-5" variant="hero" size="lg" onClick={send} busy={busy} busyLabel="Sending privately…" disabled={!point && loc.status !== "asking"}>
              Send privately
            </Button>
            <p className="mt-3 text-center text-xs text-ink-subtle">Reviewed by a person. Never shown on its own.</p>
            <SearchOverlay
              open={choosing}
              onClose={() => setChoosing(false)}
              onPick={(d) => {
                setSpot({ lat: d.lat, lon: d.lon, name: d.name });
                setChoosing(false);
              }}
              saved={[]}
              near={null}
              placeholder="Where did it happen?"
            />
          </div>
        )}
      </div>
    </div>
  );
}
