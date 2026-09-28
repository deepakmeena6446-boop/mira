"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { freshLocation, takePendingReportSpot, useLocation } from "@/lib/location-store";
import { SearchOverlay } from "@/components/app/SearchOverlay";
import { PII_LABEL, detectPii } from "@/domain/report/text";
import type { Category } from "@/domain/report/taxonomy";
import { reportGroupOrder, type ReportFrom, type ReportGroup } from "@/lib/report-groups";
import { recordUsage } from "@/lib/usage-signal";

/** Conditions and events, never people (docs/launch-ux/02 C-5.3). Hints say what fits, in everyday words. */
const TILES: Array<{ category: Category; icon: string; label: string; hint: string; group: ReportGroup }> = [
  { category: "environment", icon: "lamp", label: "Dark or broken street", hint: "Lighting, footpaths, blocked or flooded streets", group: "street" },
  { category: "transport_issue", icon: "bus", label: "Transport problem", hint: "Waits, crowding, stops not served", group: "street" },
  { category: "positive_condition", icon: "sun", label: "Something good", hint: "Good lighting, people around, help", group: "street" },
  { category: "harassment", icon: "speech", label: "Harassment", hint: "Comments, gestures, staring", group: "happened" },
  { category: "following_stalking", icon: "footsteps", label: "Being followed", hint: "Someone followed or kept watching", group: "happened" },
  { category: "unwanted_touching", icon: "hand", label: "Unwanted touch", hint: "Groping or unwanted contact", group: "happened" },
];
const GROUP_TITLE: Record<ReportGroup, string> = { street: "On the street", happened: "Something that happened" };

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

export function ReportScreen({ preset, from = null }: { preset: Category | null; from?: ReportFrom | null }) {
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
  const tile = TILES.find((t) => t.category === category) ?? (category === "other" ? { category: "other" as Category, icon: "dots", label: "Something else", hint: "", group: "happened" as ReportGroup } : null);
  const order = reportGroupOrder(from, preset);

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
    if (r.ok) {
      recordUsage("report");
      setDone(true);
    }
    else setError(r.network ? "Not sent — check your connection. Your note is still here." : r.message);
  };

  if (done) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-[calc(var(--tabbar-space)+2rem)] text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name="check" className="mira-draw size-7" />
        </span>
        <h1 className="mt-5 text-[1.75rem] font-semibold animate-rise">Thank you.</h1>
        <p className="mt-2 max-w-sm text-ink-muted animate-rise">
          It&apos;s private. If others report something similar here, it can become a community note. Mira never shows one person&apos;s report.
        </p>
        <p className="mt-2 max-w-sm text-sm text-ink-muted">
          If you&apos;re in danger right now, <EmergencyPill variant="link" />.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button variant="primary" size="lg" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
            Done
          </Button>
          <Button variant="secondary" onClick={() => { setDone(false); setCategory(null); setNote(""); }}>
            Report something else
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-xl">
        {!tile ? (
          <div className="animate-rise">
            <h1 className="text-[1.75rem] font-semibold tracking-tight">What did you notice?</h1>
            <p className="mt-1 text-ink-muted">
              {spot ? `Reporting ${spot.name ? spot.name.replace(/^Near /, "near ") : "the spot you picked on the map"}. ` : ""}Private. Only a rough area is kept.
            </p>
            {order.map((g) => (
              <section key={g} className="mt-6" aria-label={GROUP_TITLE[g]}>
                <h2 className="text-[13px] font-medium text-ink-subtle">{GROUP_TITLE[g]}</h2>
                <div className="mt-2 grid gap-2">
                  {TILES.filter((t) => t.group === g).map((t) => (
                    <button
                      key={t.category}
                      type="button"
                      onClick={() => setCategory(t.category)}
                      className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-left transition-transform duration-100 active:scale-[0.98] hover:bg-sunken"
                    >
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink">
                        <Icon name={t.icon} className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-tight">{t.label}</span>
                        <span className="block text-sm text-ink-muted">{t.hint}</span>
                      </span>
                      <Icon name="chevron" className="size-4 text-ink-subtle" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <button type="button" onClick={() => setCategory("other")} className="mt-4 min-h-11 w-full rounded-[var(--radius-button)] text-sm font-semibold text-accent-strong hover:bg-accent-soft">
              Something else
            </button>
            {spot ? null : <p className="mt-2 text-center text-sm text-ink-subtle">Tip: on the map, press and hold a spot to report it.</p>}
          </div>
        ) : (
          <div className="animate-rise">
            <button type="button" onClick={() => setCategory(null)} className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 font-semibold text-ink-muted">
              <Icon name="back" className="size-5" /> Back
            </button>
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-12 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink"><Icon name={tile.icon} className="size-6" /></span>
              <h1 className="text-2xl font-semibold">{tile.label}</h1>
            </div>

            <section className="mt-6 rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
              <p className="flex items-center gap-2 font-semibold">
                <Icon name="pin" className="size-5 text-accent" />
                {spot ? (spot.name ? `Near ${spot.name.replace(/^Near /, "")}` : "The spot you picked on the map") : loc.point ? "Around where you are now" : loc.status === "asking" ? "Finding you…" : "Location is off"}
              </p>
              {spot ? (
                <button type="button" onClick={() => setSpot(null)} className="mt-1 min-h-11 text-sm font-semibold text-accent-strong">
                  Use where I am instead
                </button>
              ) : !loc.point && loc.status !== "asking" ? (
                <button type="button" onClick={() => setChoosing(true)} className="mt-2 min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">
                  Choose where it happened
                </button>
              ) : null}
              <p className="mt-1 text-sm text-ink-muted">Only a rough area (about 1 km) is kept — never the exact spot.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {WHEN.map((w) => (
                  <button key={w.value} type="button" onClick={() => setWhen(w.value)} aria-pressed={when === w.value} className={cx("min-h-11 rounded-full border px-4 text-sm font-semibold", when === w.value ? "border-accent bg-accent text-accent-ink" : "border-line")}>
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 inline-flex rounded-full bg-sunken p-1">
                {(["experienced", "witnessed"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setInvolvement(v)} aria-pressed={involvement === v} className={cx("min-h-11 rounded-full px-4 text-sm font-semibold", involvement === v ? "bg-surface shadow" : "text-ink-muted")}>
                    {v === "experienced" ? "It happened to me" : "I saw it"}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
              <label htmlFor="note" className="font-semibold">
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
            <Button className="mt-5" variant="primary" size="lg" onClick={send} busy={busy} busyLabel="Sending privately…" disabled={!point && loc.status !== "asking"}>
              Send privately
            </Button>
            <p className="mt-3 text-center text-xs text-ink-subtle">Submitted privately. Reports may be reviewed before they can contribute to Mira&apos;s information. Never shown on its own.</p>
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
