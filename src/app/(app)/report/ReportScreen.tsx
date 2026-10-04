"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { Row, RowList } from "@/components/mira/Rows";
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

const UNSENT = "mira.report.unsent.";
/** The key of a send that may have reached the server, per category, for this tab. */
function unsentKey(category: Category): string | null {
  try { return sessionStorage.getItem(UNSENT + category); } catch { return null; }
}
function rememberUnsent(category: Category, key: string | null) {
  try { if (key) sessionStorage.setItem(UNSENT + category, key); else sessionStorage.removeItem(UNSENT + category); } catch { /* private mode: same-screen retry still reuses keyRef */ }
}

export function ReportScreen({ preset, from = null, emailAlerts = false }: { preset: Category | null; from?: ReportFrom | null; emailAlerts?: boolean }) {
  const router = useRouter();
  // Same frame as every screen: back on the left, the Support pair where it always is.
  const header = (onBack: () => void) => (
    <header className="flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line"><Icon name="back" className="size-5" /></button>
      <SafetyAccess emailAlerts={emailAlerts} compact className="min-w-0" />
    </header>
  );
  // Never asks for location by itself (audit P0-2): a position she already chose is used; otherwise she taps for one or picks the place.
  const loc = useLocation(false);
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
    // A send whose reply was lost keeps its key for this category, so Back and the same tile again can't file it twice (audit P09-002).
    keyRef.current = (category && unsentKey(category)) || crypto.randomUUID();
  }, [category]);
  const pii = useMemo(() => detectPii(note), [note]);
  const tile = TILES.find((t) => t.category === category) ?? (category === "other" ? { category: "other" as Category, icon: "dots", label: "Something else", hint: "", group: "happened" as ReportGroup } : null);
  const order = reportGroupOrder(from, preset);

  const send = async () => {
    if (!category || busy) return;
    setBusy(true);
    setError(null);
    // A picked spot is used as is; "here" (only once she chose it) is refreshed if the last fix is old.
    const where = spot ?? (loc.point ? (await freshLocation()).point : null);
    if (!where) {
      setBusy(false);
      return setError("Choose where it happened, or tap “Use where I am”.");
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
      rememberUnsent(category, null);
      setDone(true);
    } else if (r.network) {
      rememberUnsent(category, keyRef.current);
      setError("We couldn't confirm it was sent. Check your connection and send again — it won't be filed twice. Your note is still here.");
    } else setError(r.message);
  };

  if (done) {
    return (
      <div className="m-screen bg-companion">
        <div className="m-screen-inner">
          {header(() => (window.history.length > 1 ? router.back() : router.push("/")))}
          <section className="m-card mt-6 p-6 text-center">
            <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-people-soft text-people">
              <Icon name="check" className="mira-draw size-7" />
            </span>
            <h1 className="m-display mt-4">Thank you.</h1>
            <p className="mt-2 text-ink-muted">It&apos;s private. If others report something similar here, it can become a community note. Mira never shows one person&apos;s report.</p>
            <div className="mt-6 grid gap-2">
              <button type="button" className="mira-primary w-full" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>Done</button>
              <button type="button" className="min-h-12 w-full rounded-2xl bg-surface font-semibold ring-1 ring-line-strong" onClick={() => { setDone(false); setCategory(null); setNote(""); }}>Report something else</button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        {header(() => (tile ? setCategory(null) : window.history.length > 1 ? router.back() : router.push("/")))}
        {!tile ? (
          <div>
            <h1 className="m-display mt-5">What did you notice?</h1>
            <p className="mt-1 text-[0.95rem] text-ink-muted">
              {spot ? `Reporting ${spot.name ? spot.name.replace(/^Near /, "near ") : "the spot you picked on the map"}. ` : ""}Private. Only a rough area is kept.
            </p>
            {order.map((g) => (
              <RowList key={g} label={GROUP_TITLE[g]} id={`report-${g}`} className="mt-7">
                {TILES.filter((t) => t.group === g).map((t) => <Row key={t.category} icon={t.icon} tone={t.group === "street" ? "dusk" : "ink"} title={t.label} detail={t.hint} onClick={() => setCategory(t.category)} ariaLabel={`${t.label}: ${t.hint}`} />)}
              </RowList>
            ))}
            <button type="button" onClick={() => setCategory("other")} className="mt-4 min-h-11 w-full rounded-2xl text-sm font-semibold text-accent-strong hover:bg-accent-soft">
              Something else
            </button>
            {spot ? null : <p className="mt-2 text-center text-sm text-ink-subtle">Tip: on the map, press and hold a spot to report it.</p>}
          </div>
        ) : (
          <div>
            <div className="mt-5 flex items-center gap-3">
              <span aria-hidden className={cx("grid size-12 shrink-0 place-items-center rounded-2xl", tile.group === "street" ? "bg-dusk-soft text-dusk" : "bg-sunken text-ink-muted")}><Icon name={tile.icon} className="size-6" /></span>
              <h1 className="m-display">{tile.label}</h1>
            </div>

            <section className="m-card mt-6 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Icon name="pin" className="size-5 text-accent" />
                {spot ? (spot.name ? `Near ${spot.name.replace(/^Near /, "")}` : "The spot you picked on the map") : loc.point ? "Around where you are now" : loc.status === "asking" ? "Finding you…" : loc.status === "denied" ? "Location is off for Mira" : "Where did it happen?"}
              </p>
              {spot ? (
                <button type="button" onClick={() => setSpot(null)} className="mt-1 min-h-11 text-sm font-semibold text-accent-strong">
                  Use where I am instead
                </button>
              ) : !loc.point && loc.status !== "asking" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setChoosing(true)} className="min-h-11 rounded-full bg-accent-soft px-4 text-sm font-semibold text-accent-strong">
                    Choose where it happened
                  </button>
                  {loc.status !== "denied" ? (
                    <button type="button" onClick={() => void loc.request()} className="min-h-11 rounded-full px-4 text-sm font-semibold text-accent-strong ring-1 ring-line-strong">
                      Use where I am
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-1 text-sm text-ink-muted">Only a rough area (about 1 km) is kept — never the exact spot.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {WHEN.map((w) => (
                  <button key={w.value} type="button" onClick={() => setWhen(w.value)} aria-pressed={when === w.value} className={cx("min-h-11 rounded-full px-4 text-sm font-semibold ring-1", when === w.value ? "bg-accent text-accent-ink ring-accent" : "bg-surface text-ink-muted ring-line-strong")}>
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1">
                {(["experienced", "witnessed"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setInvolvement(v)} aria-pressed={involvement === v} className={cx("min-h-11 rounded-xl px-3 text-sm font-semibold", involvement === v ? "bg-surface shadow-[var(--shadow-float)]" : "text-ink-muted")}>
                    {v === "experienced" ? "It happened to me" : "I saw it"}
                  </button>
                ))}
              </div>
            </section>

            <section className="m-card mt-3 p-4">
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
                className="mt-2 w-full resize-none rounded-xl bg-sunken px-3 py-3 outline-none focus:ring-2 focus:ring-accent text-mixed"
              />
              {pii.length ? (
                <p className="mt-2 rounded-2xl bg-warm-soft px-3 py-2 text-sm text-warm">
                  This looks like it includes a {[...new Set(pii.map((p) => PII_LABEL[p.type]))].join(", ")}. Please remove it — if you send it as is, it stays private and won&apos;t be shared.
                </p>
              ) : null}
            </section>

            {error ? (
              <p role="alert" className="mt-3 rounded-2xl bg-warm-soft px-4 py-3 text-sm font-semibold text-warm">
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
