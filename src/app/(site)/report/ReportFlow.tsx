"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PlacePicker } from "@/components/places/PlacePicker";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup, FieldError, Label, TextArea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import type { PlaceSummary } from "@/lib/selection-store";
import {
  CATEGORIES,
  CATEGORY_HINT,
  CATEGORY_LABEL,
  NARRATIVE_MAX,
  RECENCIES,
  RECENCY_LABEL,
  REPORT_TIME_BANDS,
  REPORT_TIME_LABEL,
  type Category,
  type Involvement,
  type Recency,
  type ReportTimeBand,
} from "@/domain/report/taxonomy";
import { PII_LABEL, codePointLength, detectPii, normaliseNarrative } from "@/domain/report/text";
import { cx } from "@/components/ui/cx";

type Step = "form" | "review" | "done";
type Errors = Partial<Record<"involvement" | "category" | "place" | "recency" | "timeBand" | "narrative", string>>;

function newKey(): string {
  return crypto.randomUUID();
}

function Highlighted({ text }: { text: string }) {
  const spans = detectPii(text);
  if (spans.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((s, i) => {
    parts.push(text.slice(pos, s.start));
    parts.push(
      <mark key={i} className="rounded bg-warm-soft px-0.5 text-ink underline decoration-warm decoration-2 underline-offset-2">
        {text.slice(s.start, s.end)}
        <span className="sr-only"> (possible {PII_LABEL[s.type]})</span>
      </mark>,
    );
    pos = s.end;
  });
  parts.push(text.slice(pos));
  return <>{parts}</>;
}

/**
 * REPORT flow (UX spec §6). All draft data lives in React memory only — never in
 * the URL, localStorage or analytics — and survives retries until reload.
 */
export function ReportFlow({ aiAvailable }: { aiAvailable: boolean }) {
  const [step, setStep] = useState<Step>("form");
  const [involvement, setInvolvement] = useState<Involvement | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [place, setPlace] = useState<PlaceSummary | null>(null);
  const [recency, setRecency] = useState<Recency | null>(null);
  const [timeBand, setTimeBand] = useState<ReportTimeBand | null>(null);
  const [narrative, setNarrative] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<{ title: string; body: string } | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const keyRef = useRef<string>("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const cleanText = useMemo(() => normaliseNarrative(narrative), [narrative]);
  const length = codePointLength(narrative);
  const pii = useMemo(() => detectPii(cleanText), [cleanText]);

  useEffect(() => {
    if (!keyRef.current) keyRef.current = newKey();
  }, []);

  // Warn before leaving with an unsent description; never store it anywhere.
  useEffect(() => {
    if (step === "done" || !narrative.trim()) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [narrative, step]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const validate = (): boolean => {
    const e: Errors = {};
    if (!involvement) e.involvement = "Choose whether you experienced or saw this.";
    if (!category) e.category = "Choose the closest category.";
    if (!place) e.place = "Choose an approximate place in the pilot area.";
    if (!recency) e.recency = "Choose roughly when it happened.";
    if (!timeBand) e.timeBand = "Choose the time of day, or 'Not sure'.";
    if (length > NARRATIVE_MAX) e.narrative = `Please shorten the description to ${NARRATIVE_MAX} characters.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (busy) return;
    if (!navigator.onLine) {
      setSubmitError({ title: "Not sent — you appear to be offline", body: "Your observation is still here. Reconnect and press Submit again." });
      return;
    }
    setBusy(true);
    setSubmitError(null);
    const res = await api<{ received: true }>("/api/reports", {
      body: {
        idempotencyKey: keyRef.current,
        involvement,
        category,
        placeId: place!.id,
        recency,
        timeBand,
        narrative: cleanText,
        aiConsent: aiAvailable && aiConsent,
      },
    });
    setBusy(false);
    if (res.ok) {
      setNarrative("");
      setStep("done");
      return;
    }
    if (res.network) {
      setSubmitError({ title: "Not sent", body: "We couldn't reach MIRA. Your observation is still here — check your connection and try again." });
    } else if (res.status === 429) {
      setSubmitError({ title: "Not sent — too many submissions", body: "This browser has sent several observations recently. Please try again later. Your text is still here." });
    } else if (res.code === "outside_pilot") {
      setErrors({ place: res.message });
      setStep("form");
    } else if (res.status === 400) {
      setSubmitError({ title: "Not sent — please check the form", body: res.message });
      setStep("form");
    } else {
      setSubmitError({ title: "Not sent — MIRA couldn't save it", body: "Something went wrong on our side. Nothing was saved. Your observation is still here; please try again." });
    }
  };

  if (step === "done") {
    return (
      <section aria-labelledby="ack-h" className="flex flex-col gap-4 py-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
            <Icon name="check" className="size-6" />
          </span>
          <h1 id="ack-h" ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">
            Thanks. Your observation is private while it is reviewed.
          </h1>
          <p className="mt-2 text-ink-muted">
            It was received for review. It won&apos;t be published on its own. If it&apos;s approved, only its general details may be combined with
            other people&apos;s observations — and only when enough independent people have shared similar ones.
          </p>
          <p className="mt-2 text-ink-muted">There is no status page for reports, so nobody using this browser can look it up. It is deleted within 30 days.</p>
          <p className="mt-2 text-ink-muted">If you need urgent help right now, call 112. MIRA is not an emergency service.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-accent px-5 font-semibold text-accent-ink">
              Back home
            </Link>
            <Link href="/know" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-5 font-semibold">
              Know the area
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (step === "review") {
    return (
      <section aria-labelledby="review-h" className="flex flex-col gap-4 pb-4">
        <header>
          <p className="text-sm font-semibold text-accent">Step 2 of 2</p>
          <h1 id="review-h" ref={headingRef} tabIndex={-1} className="mt-1 text-3xl font-bold outline-none">
            Review before sending
          </h1>
        </header>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="font-bold">What you&apos;re sending privately</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-ink-muted">Type</dt>
            <dd>{involvement === "experienced" ? "I experienced this" : "I saw this happen"}</dd>
            <dt className="text-ink-muted">Category</dt>
            <dd>{CATEGORY_LABEL[category!]}</dd>
            <dt className="text-ink-muted">When</dt>
            <dd>
              {RECENCY_LABEL[recency!]} · {REPORT_TIME_LABEL[timeBand!]}
            </dd>
            <dt className="text-ink-muted">Where</dt>
            <dd className="text-mixed">About 500 m around {place!.name}</dd>
          </dl>
          {cleanText ? (
            <div className="mt-4">
              <h3 className="font-semibold">Your description</h3>
              <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius-control)] bg-sunken p-3 text-mixed">
                <Highlighted text={cleanText} />
              </p>
            </div>
          ) : null}
        </div>

        {pii.length > 0 ? (
          <Notice tone="attention" role="status" title="This may identify someone">
            We highlighted what looks like {[...new Set(pii.map((p) => PII_LABEL[p.type]))].join(", ")}. Please remove or generalise it — for example
            &ldquo;a man near the gate&rdquo; instead of a name or number. If you send it as is, it will be held for private review and never published.
          </Notice>
        ) : null}

        <div className="rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft p-5">
          <h2 className="font-bold">What could ever appear publicly</h2>
          <p className="mt-1 text-ink-muted">Only reviewed, combined observations may appear in Know.</p>
          <ul className="mt-2 space-y-1">
            <li>
              <strong>Area:</strong> a roughly 500 m area that includes {place!.name} — not the exact place you picked, which isn&apos;t stored.
            </li>
            <li>
              <strong>Time:</strong>{" "}
              {timeBand === "unsure" || recency === "earlier_unsure"
                ? "none — observations with unsure timing stay private"
                : `${REPORT_TIME_LABEL[timeBand!].toLowerCase()}, within the past four weeks`}
            </li>
            <li>
              <strong>Category:</strong> {CATEGORY_LABEL[category!]}
            </li>
            <li>
              <strong>Never shown:</strong> your description, your identity, exact times or points, or how many people reported.
            </li>
          </ul>
        </div>

        {submitError ? (
          <Notice tone="error" role="alert" title={submitError.title}>
            {submitError.body}
          </Notice>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={submit} busy={busy} busyLabel="Sending privately…">
            Submit privately
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setStep("form")} disabled={busy}>
            Edit
          </Button>
        </div>
        {aiAvailable && cleanText ? (
          <AiSuggest
            narrative={cleanText}
            consent={aiConsent}
            onConsent={setAiConsent}
            currentCategory={category!}
            currentBand={timeBand!}
            onApplyCategory={setCategory}
            onApplyBand={setTimeBand}
          />
        ) : null}
      </section>
    );
  }

  return (
    <form
      noValidate
      aria-labelledby="report-h"
      className="flex flex-col gap-5 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (validate()) setStep("review");
      }}
    >
      <header>
        <p className="text-sm font-semibold text-accent">Step 1 of 2</p>
        <h1 id="report-h" ref={headingRef} tabIndex={-1} className="mt-1 text-3xl font-bold outline-none">
          Share an observation
        </h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          Tell us what you experienced or noticed. It stays private while a moderator reviews it, and it is never published on its own. No account
          needed.
        </p>
      </header>

      {submitError ? (
        <Notice tone="error" role="alert" title={submitError.title}>
          {submitError.body}
        </Notice>
      ) : null}

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <ChoiceGroup
          name="involvement"
          legend="1. What's this about?"
          value={involvement}
          onChange={setInvolvement}
          error={errors.involvement}
          options={[
            { value: "experienced", label: "I experienced this" },
            { value: "witnessed", label: "I saw this happen" },
          ]}
        />
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <ChoiceGroup
          name="category"
          legend="2. What kind of observation?"
          hint="Pick the closest"
          value={category}
          onChange={setCategory}
          error={errors.category}
          options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c], description: CATEGORY_HINT[c] }))}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="font-semibold">3. Roughly where and when?</h2>
        <div>
          <PlacePicker
            label="Nearest place"
            hint="Approximate is fine — only a ~500 m area is kept"
            onPick={(p) => {
              setPlace(p);
              setErrors((e) => ({ ...e, place: undefined }));
            }}
            initialValue={place?.name ?? ""}
          />
          <FieldError id="place-error">{errors.place}</FieldError>
        </div>
        <ChoiceGroup name="recency" legend="When?" value={recency} onChange={setRecency} error={errors.recency} options={RECENCIES.map((r) => ({ value: r, label: RECENCY_LABEL[r] }))} />
        <ChoiceGroup
          name="timeBand"
          legend="Time of day"
          value={timeBand}
          onChange={setTimeBand}
          error={errors.timeBand}
          options={REPORT_TIME_BANDS.map((t) => ({ value: t, label: REPORT_TIME_LABEL[t] }))}
        />
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <Label htmlFor="narrative" hint="Optional · Hindi, English or Hinglish">
          4. Anything else to add?
        </Label>
        <TextArea
          id="narrative"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          invalid={Boolean(errors.narrative) || length > NARRATIVE_MAX}
          aria-describedby="narrative-count narrative-error"
          placeholder="What happened or what did you notice? Leave out names, phone numbers, plates, and exact addresses."
          rows={5}
          autoComplete="off"
          spellCheck
        />
        <div className="mt-1.5 flex justify-between gap-3 text-sm">
          <FieldError id="narrative-error">{errors.narrative}</FieldError>
          <p id="narrative-count" className={cx("ml-auto tabular-nums", length > NARRATIVE_MAX ? "font-semibold text-error" : "text-ink-muted")}>
            {length} / {NARRATIVE_MAX}
          </p>
        </div>
      </div>

      <Button type="submit" size="lg">
        Review <Icon name="arrow" className="size-4" />
      </Button>
      <p className="text-sm text-ink-muted">Nothing is sent until you press Submit on the next screen.</p>
    </form>
  );
}

type AiSuggestion = { category: Category | "unknown"; timeBand: "day" | "evening" | "late" | "unknown" };

/**
 * Optional, separately consented suggestion (UX spec §6). Suggestions are shown as
 * editable options and never applied or submitted automatically.
 */
function AiSuggest({
  narrative,
  consent,
  onConsent,
  currentCategory,
  currentBand,
  onApplyCategory,
  onApplyBand,
}: {
  narrative: string;
  consent: boolean;
  onConsent: (v: boolean) => void;
  currentCategory: Category;
  currentBand: ReportTimeBand;
  onApplyCategory: (c: Category) => void;
  onApplyBand: (b: ReportTimeBand) => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "none">("idle");
  const [s, setS] = useState<AiSuggestion | null>(null);
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h2 className="font-bold">Optional: suggest a category</h2>
      <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 size-4" checked={consent} onChange={(e) => onConsent(e.target.checked)} />
        <span className="text-ink-muted">
          Send my description to OpenAI to suggest a category. Detected personal details are removed first, and no place, time or contact details are
          sent. The request asks OpenAI not to store it, but it may keep data briefly for abuse monitoring. This is separate from submitting.
        </span>
      </label>
      {consent ? (
        <Button
          className="mt-3"
          variant="secondary"
          busy={state === "busy"}
          busyLabel="Getting a suggestion…"
          onClick={async () => {
            setState("busy");
            const res = await api<{ suggestion: AiSuggestion | null }>("/api/reports/suggest", { body: { narrative, consent: true } });
            if (res.ok && res.data.suggestion) {
              setS(res.data.suggestion);
              setState("done");
            } else setState("none");
          }}
        >
          Get suggestion
        </Button>
      ) : null}
      {state === "none" ? <p className="mt-2 text-sm text-ink-muted">No suggestion is available right now. Your own choices are all that&apos;s needed.</p> : null}
      {state === "done" && s ? (
        <ul className="mt-3 space-y-2">
          <li className="flex flex-wrap items-center gap-2">
            <span>Suggested category: {s.category === "unknown" ? "not sure" : CATEGORY_LABEL[s.category]}</span>
            {s.category !== "unknown" && s.category !== currentCategory ? (
              <Button variant="ghost" onClick={() => onApplyCategory(s.category as Category)}>
                Use this
              </Button>
            ) : null}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span>Suggested time of day: {s.timeBand === "unknown" ? "not stated" : REPORT_TIME_LABEL[s.timeBand]}</span>
            {s.timeBand !== "unknown" && s.timeBand !== currentBand ? (
              <Button variant="ghost" onClick={() => onApplyBand(s.timeBand as ReportTimeBand)}>
                Use this
              </Button>
            ) : null}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
