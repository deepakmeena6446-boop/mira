"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MiraPulse } from "@/components/app/MiraPulse";
import { recordUsage, usageMode, type UsageMode } from "@/lib/usage-signal";
import { SignInSheet } from "@/components/app/SignInSheet";
import { kindIcon } from "@/components/app/kinds";
import { Button } from "@/components/ui/Button";
import { useDaypart } from "@/lib/daypart-store";
import type { Daypart } from "@/domain/daypart";
import { Icon } from "@/components/ui/Icon";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { freshLocation, setPendingDestination, useLocation } from "@/lib/location-store";
import type { MiraCard } from "@/server/providers/companion/types";
import { circleSharingLine } from "@/domain/companion-output";
import { hasPlanWork, intentFromDraft, intentFromLeg, newPlanDraft } from "@/domain/plan-state";
import { setPlanDraft, usePlanDraft, usePlanHydrated } from "@/lib/plan-store";
import { DANGER } from "@/domain/urgent-intent";
import { draftFromAsk } from "@/domain/plan-ask";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: MiraCard[];
  streaming?: boolean;
  /** Not delivered: shown as a system note, not as something Mira said. */
  failed?: boolean;
}

/** What Mira is good at, as tappable examples (signed out, they open sign-in). */
const EXAMPLES = ["Take me home", "What's open nearby?", "I'm landing in London at 11 PM", "Find Help Points nearby", "I feel uneasy"];
const GUEST_EXAMPLES = ["Run a loop before dawn", "Plan my late return", "I'm landing at 1:30 AM", "Plan a local destination"];
/** After dark, the journey home and Help Points come first. */
/** For people who mostly use Mira to contribute: the everyday observation first. */
const CONTRIBUTOR_EXAMPLES = ["Report a broken streetlight", "What's open nearby?", "Take me home", "Find Help Points nearby", "I feel uneasy"];
const NIGHT_EXAMPLES = ["Take me home", "I feel uneasy", "Find somewhere staffed nearby", "What's open nearby?", "I'm landing in London at 11 PM"];

const INTRO: Record<Daypart, (name: string) => string> = {
  dawn: (n) => `Morning${n}. Ask about a place, a journey, or help nearby.`,
  day: (n) => `Hi${n}, I'm Mira. Ask me about a place, your journey, or what we know nearby.`,
  evening: (n) => `Evening${n}. Going somewhere? I can help you check the way or share your journey.`,
  night: (n) => `Hey${n}. I can help you get home, find a Help Point, or check what's open.`,
};
const MODE_LABEL = { walk: "Walk", ride: "Ride (taxi / app cab)", transit: "Public transport" } as const;
const fmtM = (m?: number) => (m === undefined ? "" : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** The phone's IANA time zone (e.g. "Europe/London"), so Mira knows her local day and time. */
function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

type StartTrip = (d: { name: string; lat: number; lon: number }) => Promise<void>;

/** Starting a trip can wait on a location fix: show it's working and ignore repeat taps. */
function TripCardButton({ label, onStart }: { label: string; onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className="mt-3"
      variant="primary"
      busy={busy}
      busyLabel="Starting…"
      onClick={async () => {
        setBusy(true);
        await onStart();
        setBusy(false);
      }}
    >
      <Icon name="share" className="size-4" /> {label}
    </Button>
  );
}

function Card({ card, onTrip }: { card: MiraCard; onTrip: StartTrip }) {
  const router = useRouter();
  const goTo = (d: { name: string; lat: number; lon: number; kind?: string }) => {
    setPendingDestination(d);
    router.push("/around/map");
  };
  switch (card.type) {
    case "trip": {
      const mode = card.mode ?? "walk";
      return (
        <div className="mt-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <p className="text-[13px] font-medium text-ink-subtle">Share journey</p>
          <p className="mt-1 text-lg font-semibold">To {card.destination.name}</p>
          <p className="text-sm text-ink-muted">
            {mode === "walk" ? (card.minutes ? `About ${card.minutes} min walk · ` : "") : `${MODE_LABEL[mode]} · `}
            {card.contacts.length || card.whatsapp?.length ? circleSharingLine(card.contacts, card.email, card.whatsapp) : "Just you: nobody is alerted automatically. Send your live link after you start."}
          </p>
          {mode === "walk" ? (
            <TripCardButton label="Go with Mira" onStart={() => onTrip(card.destination)} />
          ) : (
            // Home plans rides and public transport, and asks her for the ETA.
            <Button className="mt-3" variant="primary" onClick={() => goTo(card.destination)}>
              <Icon name="share" className="size-4" /> View route in Around
            </Button>
          )}
        </div>
      );
    }
    case "places":
      return (
        <div className="mt-2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <p className="px-4 pt-3 text-[13px] font-medium text-ink-subtle">{card.title}</p>
          <ul className="divide-y divide-line">
            {card.places.map((p) => (
              <li key={`${p.name}-${p.lat}`}>
                <button type="button" onClick={() => goTo({ name: p.name, lat: p.lat, lon: p.lon, kind: p.kind })} className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink-muted">
                    <Icon name={kindIcon(p.kind)} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-mixed">{p.name}</span>
                    <span className="block text-xs text-ink-muted">{p.kind}</span>
                  </span>
                  <span className="text-sm text-ink-subtle">{fmtM(p.distanceM)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    case "help_points":
      return (
        <div className="mt-2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <p className="px-4 pt-3 text-[13px] font-medium text-ink-subtle">{card.title}</p>
          <ul className="divide-y divide-line">
            {card.points.map((p) => (
              <li key={`${p.name}-${p.lat}`}>
                <button type="button" onClick={() => goTo({ name: p.name, lat: p.lat, lon: p.lon, kind: p.label })} className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink-muted">
                    <Icon name={kindIcon(p.label)} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-mixed">{p.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {p.label} · {p.hours}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm text-ink-subtle">
                    ~{p.minutes} min
                    <span className="block text-[0.7rem]">{p.source}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 pt-1 text-xs text-ink-subtle">Places where help is usually available. Walking times are estimates.</p>
        </div>
      );
    case "report":
      return (
        <Link href={`/report?c=${card.category}&from=mira`} className="mt-2 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 font-semibold">
          <span aria-hidden className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink"><Icon name="flag" className="size-5" /></span>
          <span className="flex-1">Report {card.label} privately</span>
          <Icon name="chevron" className="size-4 text-ink-subtle" />
        </Link>
      );
    case "sos":
      return (
        <div className="mt-2 rounded-[var(--radius-card)] bg-warm-soft p-4">
          <EmergencyPill variant="block" className="w-full" />
          <p className="mt-1 text-center text-xs text-ink-subtle">Opens your phone&apos;s dialler. Mira doesn&apos;t call anyone for you.</p>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {card.contacts.length ? `You can also share your journey so ${card.contacts.join(", ")} can see where you are.` : "Add people you trust in Circle (under You) so they can follow your journeys."}
          </p>
        </div>
      );
    case "trip_status":
      return (
        <Link href="/trip" className="mt-2 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <span className="flex-1">
            <span className="block font-semibold">On the way to {card.destination}</span>
            <span className="block text-sm text-ink-muted">ETA {new Date(card.etaAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </span>
          <Icon name="chevron" className="text-ink-subtle" />
        </Link>
      );
    case "save_place":
      return (
        <Link href="/me#places" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] border border-line-strong bg-surface px-5 font-semibold text-ink">
          <Icon name="home" className="size-4" /> Save my home
        </Link>
      );
    case "plan_brief":
      return <section className="mt-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm" aria-label="Plan evidence"><h2 className="font-semibold">Plan evidence</h2><p className="mt-1">{card.state === "ready" ? `${card.options.length} mapped walking option${card.options.length === 1 ? "" : "s"}` : card.state === "not_checked" ? "Route check not started; complete the places and time first." : `Route coverage: ${card.state}`}</p>{card.source ? <p className="text-ink-muted">{card.source} · snapshot {card.sourceAt ? new Date(card.sourceAt).toLocaleDateString() : "unknown"} · checked {new Date(card.checkedAt).toLocaleString()}{card.scope ? ` · ${card.scope}` : ""}</p> : null}{card.daylight ? <p className="mt-1">Daylight: {card.daylight.status === "known" ? `${card.daylight.value} · ${card.daylight.source.label}` : `unknown (${card.daylight.reason})`}</p> : null}<Link href={card.next === "edit_plan" ? "/plan" : "/around"} className="mt-2 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-accent px-4 font-semibold text-accent-ink">{card.next === "edit_plan" ? "Complete plan" : "Review options"}</Link><p className="mt-1 text-xs text-ink-muted">No journey starts or contact is notified from this reply.</p></section>;
  }
}

/** Signed out: what Mira does, why she needs an account, and what to ask. */
function SignedOutIntro({ onSignIn, onQuestion }: { onSignIn: () => void; onQuestion: (question: string) => void }) {
  return (
    <div className="animate-rise rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
      <p className="text-lg font-semibold">Mira is your travel companion</p>
      <p className="mt-2 text-ink-muted">
        She shares your journey with people you trust, finds Help Points and what&apos;s open near you, and tells you what Mira knows — and what it doesn&apos;t — about where you are. She never guesses whether a place is safe.
      </p>
      <p className="mt-2 text-sm text-ink-muted">You can ask about a movement plan as a guest. Plan replies are not saved to an account. An account is needed for saved conversations and journeys.</p>
      <p className="mt-4 text-[13px] font-medium text-ink-subtle">You could ask</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {GUEST_EXAMPLES.map((q) => (
          <li key={q}>
            <button type="button" onClick={() => onQuestion(q)} className="min-h-11 rounded-full border border-line bg-canvas px-4 text-sm font-semibold hover:border-accent/40">
              {q}
            </button>
          </li>
        ))}
      </ul>
      <Button className="mt-4 w-full" variant="primary" onClick={onSignIn}>
        Sign in for saved chat
      </Button>
      <p className="mt-3 text-center text-xs text-ink-subtle">Emergency and &ldquo;I feel unsafe&rdquo; are above and never wait for Mira.</p>
    </div>
  );
}

export function MiraChat({ user, emailAlerts }: { user: { name: string; avatarUrl: string | null } | null; emailAlerts: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const planDraft = usePlanDraft();
  const planHydrated = usePlanHydrated();
  const planActive = hasPlanWork(planDraft);
  const loc = useLocation(Boolean(user) && planHydrated && !planActive);
  const plan = planDraft ? intentFromDraft(planDraft) : null;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!user) return;
    void api<{ messages: Msg[] }>("/api/mira").then((r) => {
      if (r.ok) setMsgs(r.data.messages.map((m) => ({ ...m, id: String(m.id) })));
      setLoaded(true);
    });
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    const planFlow = planActive || !user;
    if (planFlow && !planActive && !DANGER.test(message)) {
      const timeZone = deviceTimeZone() ?? "UTC";
      setPlanDraft(draftFromAsk(message, newPlanDraft(new Date(), timeZone)));
    }
    recordUsage("mira");
    setInput("");
    setSending(true);
    const mine: Msg = { id: `u${Date.now()}`, role: "user", text: message, cards: [] };
    const reply: Msg = { id: `a${Date.now()}`, role: "assistant", text: "", cards: [], streaming: true };
    setMsgs((m) => [...m, mine, reply]);
    const now = new Date();
    try {
      const res = await fetch(planFlow ? "/api/mira/plan" : "/api/mira", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mira-request": "1" },
        body: planFlow ? JSON.stringify({ message, plan, legs: planDraft?.legs?.map(intentFromLeg) ?? [], countryIsos: [planDraft?.destinationCountryIso ?? null, ...(planDraft?.legs?.map((leg) => leg.destinationCountryIso) ?? [])] }) : JSON.stringify({ message, context: { localTime: now.toISOString(), tzOffsetMin: now.getTimezoneOffset(), tz: deviceTimeZone(), location: planHydrated && !planActive && loc.point ? { lat: loc.point.lat, lon: loc.point.lon } : null, area: planHydrated && !planActive ? loc.area : null } }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Mira couldn't reply just now.");
      }
      let spoken = ""; // the full reply, announced once to screen readers when it's done
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; delta?: string; card?: MiraCard };
          setMsgs((m) =>
            m.map((x) =>
              x.id === reply.id
                ? { ...x, text: ev.type === "text" ? x.text + (ev.delta ?? "") : x.text, cards: ev.type === "card" && ev.card ? [...x.cards, ev.card] : x.cards, streaming: ev.type !== "done" }
                : x,
            ),
          );
          if (ev.type === "text") spoken += ev.delta ?? "";
          if (ev.type === "done") setAnnounce(`Mira: ${spoken}`);
        }
      }
    } catch (e) {
      // fetch() rejects with a TypeError when the network is down; server errors carry a message.
      const offline = e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
      const text = offline ? "I couldn't reach the internet just now. Check your connection — your message is back in the box to resend." : e instanceof Error ? e.message : "I couldn't reply just now. Please try again.";
      setMsgs((m) => m.filter((x) => x.id !== mine.id).map((x) => (x.id === reply.id ? { ...x, text, streaming: false, failed: true } : x)));
      setInput(message);
    }
    setSending(false);
  };

  const startTrip: StartTrip = async (dest) => {
    const l = await freshLocation();
    if (!l.point) return toast("Turn on location so I can start your trip.", "error");
    const r = await api("/api/trips", { body: { from: { lat: l.point.lat, lon: l.point.lon }, to: dest, share: false } });
    if (r.ok) recordUsage("journey");
    if (r.ok || r.code === "trip_active") {
      router.push("/trip");
      router.refresh();
    } else toast(r.message, "error");
  };

  const firstName = user?.name.split(" ")[0];
  const part = useDaypart() ?? "day";
  // Chips follow how she uses Mira (device-local, day-stable); after dark the way home leads for everyone.
  const [mode, setMode] = useState<UsageMode>("cold");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage exists only after mount
    setMode(usageMode());
  }, []);
  const chips = part === "night" ? NIGHT_EXAMPLES : mode === "contribute" ? CONTRIBUTOR_EXAMPLES : EXAMPLES;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <header className="z-10 flex items-center gap-3 border-b border-line bg-canvas px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <MiraPulse size={20} state={sending ? "thinking" : "observing"} />
        <div>
          <h1 className="text-xl font-semibold leading-tight">Mira</h1>
          <p className="text-sm text-ink-muted">Places, journeys, and local context</p>
        </div>
      </header>
      <SafetyAccess emailAlerts={emailAlerts} className="z-10 border-b border-line bg-canvas px-4 py-1" />
      {planActive ? <div className="z-10 border-b border-line bg-surface px-4 py-3 text-sm"><div className="mx-auto max-w-xl"><p className="font-semibold">Your movement plan</p><p className="text-ink-muted">{plan ? `${plan.activity} · ${plan.origin.kind === "device" ? "From here" : plan.origin.query}${plan.loop ? " · loop" : ` → ${plan.destination?.query}`} · ${plan.departure.local} (${plan.departure.timeZone})` : "Your plan is still being entered. Its details are kept in this tab."}</p>{planDraft?.legs?.length ? <p className="mt-1 text-xs">Plus {planDraft.legs.length} separate travel leg{planDraft.legs.length === 1 ? "" : "s"}; review each leg in Plan.</p> : null}<p className="mt-1 text-xs text-ink-muted">Questions about this plan use checked evidence and are not saved to chat history.</p><div className="mt-1 flex gap-4"><Link href="/plan" className="font-semibold text-accent-strong">Edit plan</Link><Link href="/around" className="font-semibold text-accent-strong">View in Around</Link></div></div></div> : null}
      {user && !loc.point ? <button type="button" onClick={() => void loc.request()} className="mx-auto min-h-11 px-4 text-sm font-semibold text-accent-strong">Use current location for nearby questions</button> : null}

      {/* The log isn't live (it would re-read every streamed word); each finished reply is announced once below. */}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <div role="log" aria-live="off" aria-label="Conversation with Mira" className={cx("flex-1 overflow-y-auto px-4 pt-4", user ? "pb-44" : "pb-28")}>
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          {!user && <SignedOutIntro onSignIn={() => setSignIn(true)} onQuestion={(question) => void send(question)} />}
          {user && loaded && msgs.length === 0 && (
            <div className="animate-rise">
              <div className="flex items-start gap-3">
                <MiraPulse size={16} className="mt-[5px]" />
                <p className="max-w-[90%] text-mixed">{INTRO[part](firstName ? ` ${firstName}` : "")}</p>
              </div>
            </div>
          )}
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end animate-rise">
                <p className="max-w-[80%] rounded-[var(--radius-card)] rounded-br-md bg-sunken px-4 py-2.5 text-ink text-mixed">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-3 animate-rise">
                <MiraPulse size={16} state={m.failed ? "attention" : m.streaming && !m.text ? "thinking" : "observing"} className="mt-[5px]" />
                <div className="min-w-0 max-w-[90%] flex-1">
                  <div className={cx(m.failed ? "rounded-[var(--radius-card)] bg-warm-soft px-4 py-3 text-warm" : "")} role={m.failed ? "alert" : undefined}>
                    {m.text ? <p className="text-mixed">{m.text}</p> : <span className="inline-flex gap-1" aria-label="Mira is typing"><span className="size-2 animate-bounce rounded-full bg-ink-subtle" /><span className="size-2 animate-bounce rounded-full bg-ink-subtle [animation-delay:120ms]" /><span className="size-2 animate-bounce rounded-full bg-ink-subtle [animation-delay:240ms]" /></span>}
                  </div>
                  {m.cards.map((c, i) => (
                    <Card key={i} card={c} onTrip={startTrip} />
                  ))}
                </div>
              </div>
            ),
          )}
          <div ref={endRef} className="h-px scroll-mb-56" />
        </div>
      </div>

      {(
        <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-space)+0.5rem)] z-30 px-4">
          <div className="mx-auto max-w-xl">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {chips.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} disabled={sending} className="min-h-11 shrink-0 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-line-strong">
                  {q}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line-strong bg-surface p-1.5 pl-4 shadow-[var(--shadow-float)]"
            >
              <label htmlFor="mira-input" className="sr-only">
                Message Mira
              </label>
              <input id="mira-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Message Mira…" autoComplete="off" className="min-h-11 flex-1 bg-transparent text-base outline-none" />
              <button type="submit" disabled={!input.trim() || sending} aria-label="Send" className={cx("grid size-11 place-items-center rounded-full transition-colors", input.trim() ? "bg-accent text-accent-ink" : "bg-sunken text-ink-subtle")}>
                <Icon name="send" className="size-5" />
              </button>
            </form>
          </div>
        </div>
      )}
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to talk to Mira" />
    </div>
  );
}
