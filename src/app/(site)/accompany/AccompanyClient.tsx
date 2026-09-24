"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlacePicker } from "@/components/places/PlacePicker";
import { Button } from "@/components/ui/Button";
import { FieldError, Label, TextInput } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { useSelectedPlace, type PlaceSummary } from "@/lib/selection-store";
import { formatIstDateTime, formatIstTime } from "@/lib/time";
import type { JourneyView } from "@/server/journey/service";

const DISCLOSURE =
  "MIRA does not track your route. It asks you to check in at your ETA. If you miss the check-in by 10 minutes, MIRA can attempt one email to an accepted contact; delivery is not guaranteed.";

const ETA_CHOICES = [15, 30, 45, 60, 120] as const;

function minutesLabel(m: number) {
  return m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? "" : "s"}`;
}

/** Next occurrence of HH:MM (IST) after now. */
function etaFromClock(hhmm: string, now: Date): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const istNow = new Date(now.getTime() + 330 * 60_000);
  const target = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), Number(m[1]), Number(m[2])) - 330 * 60_000;
  return new Date(target <= now.getTime() ? target + 86_400_000 : target);
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function remaining(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 1) return "less than a minute";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function AccompanyClient({
  initial,
  journeysAvailable,
  contactAvailable,
}: {
  initial: JourneyView | null;
  journeysAvailable: boolean;
  contactAvailable: boolean;
}) {
  const [journey, setJourney] = useState<JourneyView | null>(initial);
  const [showSetup, setShowSetup] = useState(!initial);
  const refresh = useCallback(async () => {
    const res = await api<{ journey: JourneyView | null }>("/api/journeys/current");
    if (res.ok) setJourney(res.data.journey);
  }, []);

  // The worker owns missed/expiry transitions; reflect them while the page is open.
  useEffect(() => {
    if (!journey || (journey.state !== "active" && journey.state !== "missed")) return;
    const t = setInterval(refresh, 20_000);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [journey, refresh]);

  if (journey && (journey.state === "active" || journey.state === "missed")) {
    return <ActiveJourney journey={journey} onChange={setJourney} />;
  }
  if (journey && !showSetup) {
    return <ClosedJourney journey={journey} onNew={() => setShowSetup(true)} journeysAvailable={journeysAvailable} />;
  }
  if (!journeysAvailable) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <Notice tone="attention" title="Check-ins are paused">
          The background service that handles missed check-ins, automatic closing and deletion isn&apos;t running, so MIRA can&apos;t start a journey
          right now. Please try again later.
        </Notice>
      </div>
    );
  }
  return (
    <SetupForm
      contactAvailable={contactAvailable}
      onCreated={(j) => {
        setJourney(j);
        setShowSetup(false);
      }}
    />
  );
}

function Header() {
  return (
    <header>
      <h1 className="text-3xl font-bold">Make sure I reach</h1>
      <p className="mt-1 max-w-prose text-ink-muted">Set a private check-in for when you expect to arrive. Optionally, one person you choose can get one email if you miss it.</p>
    </header>
  );
}

function SetupForm({ contactAvailable, onCreated }: { contactAvailable: boolean; onCreated: (j: JourneyView) => void }) {
  const handoff = useSelectedPlace();
  const [place, setPlace] = useState<PlaceSummary | null>(handoff);
  const [useLabel, setUseLabel] = useState(false);
  const [label, setLabel] = useState("");
  const [etaChoice, setEtaChoice] = useState<number | "custom" | null>(null);
  const [customTime, setCustomTime] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const keyRef = useRef("");
  useEffect(() => {
    keyRef.current = crypto.randomUUID();
  }, []);

  const now = useNow(15_000);
  const etaAt = (at: Date): Date | null => {
    if (etaChoice === "custom") return etaFromClock(customTime, at);
    if (typeof etaChoice === "number") return new Date(at.getTime() + etaChoice * 60_000);
    return null;
  };
  const etaPreview = etaAt(now);

  const start = async () => {
    const eta = etaAt(new Date());
    const e: Record<string, string> = {};
    if (useLabel ? !label.trim() : !place) e.destination = useLabel ? "Add a short label for where you're going." : "Choose where you're going, or use your own label.";
    if (!eta) e.eta = "Choose when you expect to arrive.";
    else {
      const d = eta.getTime() - Date.now();
      if (d < 5 * 60_000 - 30_000) e.eta = "Your ETA must be at least 5 minutes from now.";
      if (d > 4 * 3600_000) e.eta = "Your ETA can be at most 4 hours from now.";
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = "Check the email address.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError(null);
    const res = await api<{ journey: JourneyView }>("/api/journeys", {
      body: {
        idempotencyKey: keyRef.current,
        destination: useLabel ? { label: label.trim() } : { placeId: place!.id },
        etaAt: eta!.toISOString(),
        ...(email.trim() && contactAvailable ? { contactEmail: email.trim() } : {}),
      },
    });
    setBusy(false);
    if (res.ok) {
      onCreated(res.data.journey);
      return;
    }
    if (res.code === "journey_already_active") {
      const cur = await api<{ journey: JourneyView | null }>("/api/journeys/current");
      if (cur.ok && cur.data.journey) return onCreated(cur.data.journey);
    }
    if (res.fields?.includes("etaAt")) setErrors({ eta: res.message });
    else if (res.fields?.includes("contactEmail")) setErrors({ email: res.message });
    else setFormError(res.network ? "Not started — we couldn't reach MIRA. Check your connection and try again." : res.message);
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <Header />

      <section aria-labelledby="dest-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 id="dest-h" className="font-semibold">
          Where are you going?
        </h2>
        {useLabel ? (
          <div>
            <Label htmlFor="label" hint="Kept private and encrypted">
              Your label
            </Label>
            <TextInput id="label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hostel, Friend's place" invalid={!!errors.destination} />
            <p className="mt-1 text-sm text-ink-muted">Avoid your exact address. A contact alert says &ldquo;planned destination&rdquo;, never your label.</p>
          </div>
        ) : (
          <PlacePicker label="Destination" hint="A place in the pilot area" onPick={setPlace} initialValue={handoff?.name ?? ""} />
        )}
        <FieldError id="dest-error">{errors.destination}</FieldError>
        <button
          type="button"
          className="min-h-11 self-start rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-soft"
          onClick={() => {
            setUseLabel((v) => !v);
            setErrors({});
          }}
        >
          {useLabel ? "Pick a mapped place instead" : "Use my own label instead"}
        </button>
      </section>

      <section aria-labelledby="eta-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <fieldset aria-describedby={errors.eta ? "eta-error" : undefined}>
          <legend id="eta-h" className="font-semibold">
            When do you expect to arrive?
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ETA_CHOICES.map((m) => (
              <label
                key={m}
                className={cx(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent",
                  etaChoice === m ? "border-accent bg-accent-soft text-accent-strong" : "border-line-strong",
                )}
              >
                <input type="radio" name="eta" className="sr-only" checked={etaChoice === m} onChange={() => setEtaChoice(m)} />
                In {minutesLabel(m)}
              </label>
            ))}
            <label
              className={cx(
                "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent",
                etaChoice === "custom" ? "border-accent bg-accent-soft text-accent-strong" : "border-line-strong",
              )}
            >
              <input type="radio" name="eta" className="sr-only" checked={etaChoice === "custom"} onChange={() => setEtaChoice("custom")} />
              Pick a time
            </label>
          </div>
        </fieldset>
        {etaChoice === "custom" ? (
          <div className="max-w-48">
            <Label htmlFor="eta-time" hint="IST">
              Arrive by
            </Label>
            <TextInput id="eta-time" type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} invalid={!!errors.eta} />
          </div>
        ) : null}
        {etaPreview ? <p className="text-ink-muted">Check-in time: about {formatIstTime(etaPreview)}</p> : null}
        <FieldError id="eta-error">{errors.eta}</FieldError>
      </section>

      <section aria-labelledby="contact-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 id="contact-h" className="font-semibold">
          Trusted contact <span className="text-sm font-normal text-ink-muted">Optional</span>
        </h2>
        {contactAvailable ? (
          <>
            <div>
              <Label htmlFor="email">Their email</Label>
              <TextInput id="email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} aria-describedby="email-help email-error" />
              <FieldError id="email-error">{errors.email}</FieldError>
            </div>
            <p id="email-help" className="text-sm text-ink-muted">
              When you start, MIRA emails them an invitation for this journey only. They must accept before any alert can be sent. If they accept and you
              miss your check-in by 10 minutes, MIRA tries to send them one email with your ETA and, if you picked a mapped place, its name — never your
              location or route. Let them know to expect it.
            </p>
          </>
        ) : (
          <p className="text-ink-muted">Contact alerts are unavailable; you can still use a private check-in.</p>
        )}
      </section>

      <p className="rounded-[var(--radius-control)] border border-accent/30 bg-accent-soft px-4 py-3">{DISCLOSURE}</p>

      {formError ? (
        <Notice tone="error" role="alert" title="Journey not started">
          {formError}
        </Notice>
      ) : null}

      <Button size="lg" onClick={start} busy={busy} busyLabel="Starting…">
        Start journey
      </Button>
      <p className="text-sm text-ink-muted">
        This journey belongs to this browser only. If you clear cookies or switch devices, you won&apos;t be able to reopen it — it will still close on
        its own.
      </p>
    </div>
  );
}

function contactCopy(c: JourneyView["contact"]): string {
  switch (c) {
    case "none":
      return "No contact invited — nobody will be alerted.";
    case "invite_pending":
      return "Invitation sent. Your contact can't be alerted until they accept.";
    case "invite_failed":
      return "We couldn't send the invitation email, so no contact can be alerted. Your private check-in still works.";
    case "accepted":
      return "Your contact accepted. If you miss the check-in by 10 minutes, MIRA will attempt one email.";
    case "revoked":
      return "Contact removed. Nobody will be alerted.";
  }
}

function alertCopy(a: JourneyView["alert"]): { title: string; body: string; tone: "info" | "error" | "neutral" } {
  switch (a) {
    case "claimed":
      return { title: "Trying to send the contact alert…", body: "MIRA is attempting one email to your contact.", tone: "neutral" };
    case "sent":
      return { title: "Contact alert sent", body: "The email server accepted one email to your contact. That doesn't confirm they received or read it.", tone: "neutral" };
    case "failed":
      return { title: "Delivery failed", body: "MIRA couldn't send the email. Your contact was not alerted.", tone: "error" };
    case "unconfirmed":
      return { title: "Delivery unconfirmed", body: "MIRA can't tell whether the email went out. It won't try again.", tone: "error" };
    default:
      return { title: "No contact was notified", body: "There was no accepted contact for this journey, so nobody was alerted.", tone: "neutral" };
  }
}

function ActiveJourney({ journey, onChange }: { journey: JourneyView; onChange: (j: JourneyView) => void }) {
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eta = new Date(journey.etaAt);
  const left = eta.getTime() - now.getTime();
  const due = left <= 0;
  const missed = journey.state === "missed";

  const act = async (action: "arrive" | "end" | "revoke-contact" | "extend", body?: unknown) => {
    setBusy(action);
    setError(null);
    const res = await api<{ journey: JourneyView }>(`/api/journeys/${journey.id}/${action}`, { body: body ?? {} });
    setBusy(null);
    if (res.ok) {
      onChange(res.data.journey);
      setConfirmEnd(false);
      setExtendOpen(false);
    } else {
      setError(res.network ? "We couldn't reach MIRA. Your journey is unchanged — try again." : res.message);
    }
  };

  const maxEta = new Date(journey.maxEtaAt).getTime();
  const extendOptions = [15, 30, 60].filter((m) => Math.max(eta.getTime(), now.getTime()) + m * 60_000 <= maxEta);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header>
        <p className="text-sm font-semibold text-accent">{missed ? "Check-in missed" : "Journey active"}</p>
        <h1 className="mt-1 text-3xl font-bold text-mixed">{journey.destination.name}</h1>
      </header>

      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}

      {missed ? (
        <section aria-live="polite" className="rounded-[var(--radius-card)] border border-warm/40 bg-warm-soft p-5">
          <h2 className="text-xl font-bold">You missed the check-in.</h2>
          {(() => {
            const a = alertCopy(journey.alert);
            return (
              <p className="mt-1">
                <strong className={a.tone === "error" ? "text-error" : undefined}>{a.title}.</strong> {a.body}
              </p>
            );
          })()}
          <p className="mt-2 text-sm text-ink-muted">
            MIRA isn&apos;t an emergency service and hasn&apos;t contacted anyone else. If you need urgent help, call 112. This journey closes automatically at{" "}
            {formatIstTime(journey.expiresAt)}.
          </p>
        </section>
      ) : (
        <section aria-labelledby="eta-status" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <p id="eta-status" className="text-ink-muted">
            Check in by <strong className="text-ink">{formatIstTime(eta)}</strong>
          </p>
          <p className="mt-1 text-3xl font-bold" aria-live="polite">
            {due ? `Check-in due${left < -60_000 ? ` · ${remaining(left)} over` : ""}` : `${remaining(left)} left`}
          </p>
          {due ? (
            <p className="mt-1 text-ink-muted">
              {journey.contact === "accepted" ? `Your contact may be emailed after ${formatIstTime(journey.missAt)}.` : `Marked as missed after ${formatIstTime(journey.missAt)}.`}
            </p>
          ) : null}
        </section>
      )}

      {due && !missed ? (
        <section aria-labelledby="checkin-h" className="rounded-[var(--radius-card)] border border-accent bg-accent-soft p-5">
          <h2 id="checkin-h" className="text-xl font-bold">
            Time to check in. Did you arrive?
          </h2>
        </section>
      ) : null}

      <Button size="lg" onClick={() => act("arrive")} busy={busy === "arrive"} busyLabel="Saving…" disabled={!!busy && busy !== "arrive"}>
        <Icon name="check" /> I arrived
      </Button>

      {journey.canExtend && !missed ? (
        <div>
          {extendOpen ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <p className="font-medium">Extend once — how much more time?</p>
              {extendOptions.length ? (
                <div className="flex flex-wrap gap-2">
                  {extendOptions.map((m) => (
                    <Button
                      key={m}
                      variant="secondary"
                      busy={busy === "extend"}
                      onClick={() => act("extend", { etaAt: new Date(Math.max(eta.getTime(), Date.now()) + m * 60_000).toISOString() })}
                    >
                      +{minutesLabel(m)}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-ink-muted">This journey is already close to its 4-hour limit.</p>
              )}
              <Button variant="ghost" onClick={() => setExtendOpen(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="lg" onClick={() => setExtendOpen(true)}>
              Extend ETA (once)
            </Button>
          )}
        </div>
      ) : null}

      {confirmEnd ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <p className="font-medium">End this journey? MIRA will stop the check-in and won&apos;t alert anyone.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" busy={busy === "end"} onClick={() => act("end")}>
              Yes, end journey
            </Button>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
              Keep it running
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="lg" onClick={() => setConfirmEnd(true)}>
          {missed ? "Close this journey" : "End journey"}
        </Button>
      )}

      <section aria-labelledby="contact-status-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 id="contact-status-h" className="font-semibold">
          Contact
        </h2>
        <p className="mt-1 text-ink-muted">{contactCopy(journey.contact)}</p>
        {(journey.contact === "invite_pending" || journey.contact === "accepted") && !missed ? (
          <Button className="mt-3" variant="ghost" busy={busy === "revoke-contact"} onClick={() => act("revoke-contact")}>
            Remove contact
          </Button>
        ) : null}
      </section>

      <p className="text-sm text-ink-muted">{DISCLOSURE}</p>
    </div>
  );
}

function ClosedJourney({ journey, onNew, journeysAvailable }: { journey: JourneyView; onNew: () => void; journeysAvailable: boolean }) {
  const title = { arrived: "You've arrived. Journey complete.", ended: "Journey ended.", expired: "This journey closed automatically." }[journey.state as "arrived" | "ended" | "expired"];
  const a = journey.missedAt ? alertCopy(journey.alert) : null;
  return (
    <div className="flex flex-col gap-4 pb-4">
      <section aria-labelledby="closed-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name="check" className="size-6" />
        </span>
        <h1 id="closed-h" className="mt-4 text-2xl font-bold">
          {title}
        </h1>
        {journey.state === "expired" ? <p className="mt-1 text-ink-muted">It closed 30 minutes after the check-in time without a check-in.</p> : null}
        {a ? (
          <p className="mt-2">
            <strong>{a.title}.</strong> {a.body}
          </p>
        ) : null}
        <p className="mt-2 text-ink-muted">
          The details of this journey{journey.contact !== "none" ? " and your contact's email" : ""} will be deleted by{" "}
          {journey.purgeAt ? formatIstDateTime(journey.purgeAt) : "the end of the day"}. MIRA keeps no journey history.
        </p>
        {journeysAvailable ? (
          <Button className="mt-5" onClick={onNew}>
            Start another journey
          </Button>
        ) : null}
      </section>
    </div>
  );
}
