"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MiraPulse } from "@/components/app/MiraPulse";
import { recordUsage } from "@/lib/usage-signal";
import { SignInSheet } from "@/components/app/SignInSheet";
import { kindIcon } from "@/components/app/kinds";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmergencyPill } from "@/components/app/EmergencyPill";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { RootHeader } from "@/components/mira/Frame";
import { SkyCard, skyAt } from "@/components/mira/LiveNow";
import { EvidenceGlyph, EVIDENCE_LABEL, type EvidenceKind } from "@/components/mira/Evidence";
import { api } from "@/lib/api-client";
import { takeHandedOff } from "@/lib/ask-handoff";
import { freshLocation, setPendingDestination, useClock, useLocation, usableLocationPoint } from "@/lib/location-store";
import type { MiraCard } from "@/server/providers/companion/types";
import { circleSharingLine } from "@/domain/companion-output";
import { clockIn } from "@/domain/daylight";
import { useDaypart } from "@/lib/daypart-store";
import { hasPlanWork, intentFromDraft, newPlanDraft, UNKNOWN_PROVENANCE } from "@/domain/plan-state";
import { planToCardPlace } from "@/lib/plan-handoff";
import { clearPlanDraft, setPlanDraft, usePlanDraft, usePlanHydrated } from "@/lib/plan-store";
import { planTitle, whenWords } from "@/domain/plan-name";
import { draftFromAsk } from "@/domain/plan-ask";
import { arrivalIntent, shouldSeedPlan, immediateSupportIntent } from "@/domain/ask-routing";
import { activeTripMessage, tripStartExtras } from "@/lib/trip-start";
import { haptic } from "@/lib/haptics";
import { refreshCurrentTrip } from "@/lib/current-trip-store";

/** A random id for this browser, so guests sharing one network each get their own Mira allowance. Not tracking: never sent signed in. */
function guestDevice(): string | undefined {
  try {
    const KEY = "mira.guest.device";
    const v = localStorage.getItem(KEY) ?? crypto.randomUUID();
    localStorage.setItem(KEY, v);
    return v;
  } catch {
    return undefined;
  }
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: MiraCard[];
  streaming?: boolean;
  /** Not delivered: shown as a system note, not as something Mira said. */
  failed?: boolean;
}

/** After dark, the way home and help nearby lead (the theme follows the device clock or her setting). */
const NIGHT_STARTERS: Array<{ title: string; icon: string; asks: string[] }> = [
  { title: "Getting home", icon: "home", asks: ["Take me home", "Find somewhere staffed nearby"] },
];
/** Situations, not prompts: each starter is something a person is about to do. */
const STARTERS: Array<{ title: string; icon: string; asks: string[] }> = [
  { title: "Going out", icon: "route", asks: ["I’m walking from my hotel to a café at 10:30 PM", "Is there a better way for me to get home tonight?"] },
  { title: "Running or walking", icon: "walk", asks: ["Can I go for a run here around 5 AM?"] },
  { title: "Travelling", icon: "airport", asks: ["I land at 1 AM and need to get to my hotel"] },
  { title: "Right now", icon: "pin", asks: ["What’s open nearby?", "Find Help Points nearby"] },
];
const MODE_LABEL = { walk: "Walk", ride: "Taxi / ride", transit: "Public transport" } as const;
const fmtM = (m?: number) => (m === undefined ? "" : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** The phone's IANA time zone (e.g. "Europe/London"), so Mira knows her local day and time. */
function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

type StartTrip = (d: { name: string; lat: number; lon: number; savedPlaceId?: string }) => Promise<void>;

/** Starting a trip can wait on a location fix: show it's working and ignore repeat taps. */
function TripCardButton({ label, onStart }: { label: string; onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      className="flex-1"
      busy={busy}
      busyLabel="Starting…"
      onClick={async () => {
        setBusy(true);
        await onStart();
        setBusy(false);
      }}
    >
      {label}
    </Button>
  );
}

/** One compact evidence line inside a reply card. */
function Fact({ kind, children, label }: { kind: EvidenceKind; children: React.ReactNode; label?: string }) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm">
      <EvidenceGlyph kind={kind} className="mt-[3px]" />
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 text-[0.7rem] font-semibold text-ink-subtle">{label ?? EVIDENCE_LABEL[kind]}</span>
    </li>
  );
}

/** The open journey in the chat: open it, or say "I'm here" right from the card (re-audit RA4: it took one more screen). */
function TripStatusCard({ card, shell }: { card: Extract<MiraCard, { type: "trip_status" }>; shell: string }) {
  const toast = useToast();
  const [state, setState] = useState<"open" | "busy" | "arrived">(card.state === "active" || card.state === "missed" ? "open" : "arrived");
  const arrive = async () => {
    setState("busy");
    const id = card.id ?? (await api<{ trip: { id: string } | null }>("/api/trips/current").then((r) => (r.ok ? r.data.trip?.id : undefined)));
    const r = id ? await api(`/api/trips/${id}/arrive`, { body: {} }) : null;
    if (r?.ok) { haptic("arrived"); setState("arrived"); refreshCurrentTrip(); }
    else { setState("open"); toast(r?.message ?? "This journey has already finished.", "error"); }
  };
  return (
    <div className={cx(shell, "p-4")}>
      <Link href="/trip" className="flex items-center gap-3">
        <MiraPulse size={16} state="with-you" />
        <span className="flex-1">
          <span className="block font-semibold">{state === "arrived" ? `Arrived at ${card.destination}` : `On the way to ${card.destination}`}</span>
          <span className="block text-sm text-ink-muted">{state === "arrived" ? "Your journey is closed. Nobody will be alerted." : `ETA ${clockIn(card.etaAt)}`}</span>
        </span>
        <Icon name="chevron" className="text-ink-subtle" />
      </Link>
      {state !== "arrived" ? <button type="button" onClick={arrive} disabled={state === "busy"} className="mt-3 min-h-11 w-full rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-60">I&apos;m here</button> : null}
    </div>
  );
}

function Card({ card, onTrip, onComparePlace, onStartHere }: { card: MiraCard; onTrip: StartTrip; onComparePlace: (d: { name: string; lat: number; lon: number; savedPlaceId?: string }) => void; onStartHere: () => void }) {
  const router = useRouter();
  // A card place goes to Around with its provider id; one without a recorded source is marked unknown.
  const show = (d: { name: string; lat: number; lon: number; kind?: string; placeId?: string }) => {
    setPendingDestination({ ...d, placeId: d.placeId ?? UNKNOWN_PROVENANCE });
    router.push("/around");
  };
  const shell = "m-card mt-2 overflow-hidden";
  switch (card.type) {
    case "trip": {
      const mode = card.mode ?? "walk";
      return (
        <div className={cx(shell, "p-4")}>
          <p className="m-label">A journey Mira can follow</p>
          <p className="mt-1 text-lg font-semibold">To {card.destination.name}</p>
          <ul className="mt-1 divide-y divide-line">
            {mode === "walk" && card.minutes ? <Fact kind="estimate">About {card.minutes} min walk</Fact> : <Fact kind="none">{MODE_LABEL[mode]} · you set the check-in time</Fact>}
            <Fact kind="checked">{card.contacts.length || card.whatsapp?.length ? circleSharingLine(card.contacts, card.email, card.whatsapp) : "Just you: nobody is alerted automatically. Send your live link after you start."}</Fact>
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onComparePlace(card.destination)} className="mira-primary flex-1">Compare ways</button>
            {mode === "walk" ? <TripCardButton label="Go with Mira" onStart={() => onTrip(card.destination)} /> : null}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Nothing starts until you tap. Comparing shows lighting, Help Points and daylight first.</p>
        </div>
      );
    }
    case "places":
    case "help_points": {
      const rows = card.type === "places" ? card.places.map((p) => ({ key: `${p.name}-${p.lat}`, name: p.name, sub: p.kind, right: fmtM(p.distanceM), icon: kindIcon(p.kind), go: () => show({ name: p.name, lat: p.lat, lon: p.lon, kind: p.kind, placeId: p.placeId }) })) : card.points.map((p) => ({ key: `${p.name}-${p.lat}`, name: p.name, sub: `${p.label} · ${p.hours}`, right: `~${p.minutes} min`, icon: kindIcon(p.label), go: () => show({ name: p.name, lat: p.lat, lon: p.lon, kind: p.label, placeId: p.placeId }) }));
      return (
        <div className={shell}>
          <p className="m-label px-4 pt-3">{card.title}</p>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={r.go} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-ink-muted"><Icon name={r.icon} className="size-[18px]" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-mixed">{r.name}</span><span className="line-clamp-2 block text-xs text-ink-muted">{r.sub}</span></span>
                  <span className="shrink-0 text-sm text-ink-subtle">{r.right}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 pt-1 text-xs text-ink-subtle">{card.type === "help_points" ? "Listed hours from the source; staffing isn’t verified. Walking times are by distance." : "Tap a place to see what Mira knows around it."}</p>
        </div>
      );
    }
    case "report":
      return (
        <Link href={`/report?c=${card.category}&from=mira`} className={cx(shell, "flex items-center gap-3 p-4 font-semibold")}>
          <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-people-soft text-people"><Icon name="flag" className="size-5" /></span>
          <span className="flex-1">Report {card.label} privately</span>
          <Icon name="chevron" className="size-4 text-ink-subtle" />
        </Link>
      );
    case "sos":
      return (
        <div className="mt-2 rounded-[var(--radius-tile)] bg-warm-soft p-4">
          <EmergencyPill variant="block" className="w-full" />
          <p className="mt-1 text-center text-xs text-ink-subtle">Opens your phone&apos;s dialler. Mira doesn&apos;t call anyone for you.</p>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {card.contacts.length ? `You can also share your journey so ${card.contacts.join(", ")} can see where you are.` : "Add people you trust in Circle (under You) so they can follow your journeys."}
          </p>
        </div>
      );
    case "trip_status":
      return <TripStatusCard card={card} shell={shell} />;
    case "save_place":
      return (
        <Link href="/me#places" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-5 font-semibold text-ink ring-1 ring-line-strong">
          <Icon name="home" className="size-4" /> Save my home
        </Link>
      );
    case "plan_brief": {
      const ready = card.state === "ready";
      return (
        <section className={cx(shell, "p-4")} aria-label="Plan evidence">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Plan evidence</h2><span className="text-xs text-ink-subtle">checked {clockIn(card.checkedAt)}</span></div>
          <ul className="mt-1 divide-y divide-line">
            {card.state === "not_checked" ? <Fact kind="pending" label="Needs you">Route check not started — places and time needed first</Fact> : ready ? <Fact kind="estimate">{card.options.length} mapped walking option{card.options.length === 1 ? "" : "s"}{card.options[0] ? ` · fastest about ${Math.round(card.options[0].minutes)} min` : ""}</Fact> : <Fact kind={card.state === "failed" ? "failed" : "none"}>Mapped walking route: {card.state === "failed" ? "the check failed" : card.state === "stale" ? "the map snapshot is too old" : "not available for this area"}</Fact>}
            {card.daylight ? <Fact kind={card.daylight.status === "known" ? "checked" : "none"}>{card.daylight.status === "known" ? `Daylight: ${String(card.daylight.value)} · ${card.daylight.source.label}` : "Daylight not calculated yet"}</Fact> : null}
          </ul>
          <div className="mt-3 flex gap-2">
            <Link href="/plan" className="mira-primary flex-1">{card.next === "edit_plan" ? "Complete plan" : "Review options"}</Link>
            {card.state === "not_checked" ? <button type="button" onClick={onStartHere} className="min-h-12 rounded-2xl px-3 text-sm font-semibold ring-1 ring-line-strong">Start where I am</button> : null}
          </div>
          <p className="mt-2 text-xs text-ink-muted">The full brief adds lighting, Help Points and local updates. No journey starts and nobody is notified from this reply.</p>
        </section>
      );
    }
  }
}

/** Signed out: what Mira does without an account, and what needs one. */
function GuestNote({ onSignIn }: { onSignIn: () => void }) {
  return (
    <p className="text-[0.8125rem] text-ink-muted">
      As a guest, nothing you send Mira is saved. <button type="button" onClick={onSignIn} className="font-semibold text-accent-strong underline">Sign in</button> for your saved places, your Circle and live journeys.
    </p>
  );
}

export function MiraChat({ user, emailAlerts }: { user: { name: string; avatarUrl: string | null } | null; emailAlerts: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const planDraft = usePlanDraft();
  const planHydrated = usePlanHydrated();
  const planActive = hasPlanWork(planDraft);
  const loc = useLocation(false);
  const clock = useClock();
  const here = usableLocationPoint(loc, clock?.getTime());
  const plan = planDraft ? intentFromDraft(planDraft) : null;
  // Ask never requests GPS itself (D12): the context card appears only when this session already has her position.
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  /**
   * A private conversation (signed in): once a turn can't be kept — a plan, a movement, her location, or a question
   * handed over from an outing or a place — every later turn stays private too, until "New conversation". Its turns
   * live only in this screen's memory and are sent back as context; the server never stores them (sprint 03 §E).
   * `privateFrom`: the id of the conversation's first message; `startPrivate`: a handed-over question opens one.
   */
  const privateFrom = useRef<string | null>(null);
  const startPrivate = useRef(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const enterPrivate = (fromId: string) => {
    if (privateFrom.current !== null) return;
    privateFrom.current = fromId;
    setIsPrivate(true);
  };
  const newConversation = () => {
    const from = privateFrom.current;
    privateFrom.current = null;
    startPrivate.current = false;
    setIsPrivate(false);
    // The private turns leave the screen (they were never stored); saved history above them stays.
    setMsgs((m) => { const i = from ? m.findIndex((x) => x.id === from) : -1; return i >= 0 ? m.slice(0, i) : m; });
  };
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!user) return;
    void api<{ messages: Msg[] }>("/api/mira").then((r) => {
      // History that arrives after she already sent something goes before it, never over it (a fast first message
      // and its reply used to vanish when the history load finished).
      if (r.ok) setMsgs((now) => [...r.data.messages.map((m) => ({ ...m, id: String(m.id) })), ...now]);
      setLoaded(true);
    });
  }, [user]);

  useEffect(() => {
    if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    // Urgent words open the support sheet at once, before any network — and Mira still answers underneath it, so when
    // she closes the sheet there's a calm reply in her words, not silence (the message used to be dropped).
    const urgent = Boolean(immediateSupportIntent(message));
    if (urgent) window.dispatchEvent(new Event("mira:need-options"));
    // "I'm home" during a live journey: telling Mira doesn't end it. Say so before she puts the phone away,
    // or her contacts get a missed-check-in alert while she's safe.
    if (!urgent && user && arrivalIntent(message)) {
      const current = await api<{ trip: { id: string; destination: { name: string }; etaAt: string; state: string } | null }>("/api/trips/current");
      const trip = current.ok ? current.data.trip : null;
      if (trip && (trip.state === "active" || trip.state === "missed")) {
        setInput("");
        setMsgs((m) => [
          ...m,
          { id: `u${Date.now()}`, role: "user", text: message, cards: [] },
          { id: `a${Date.now()}`, role: "assistant", text: "Glad you're there. Telling me doesn't end your journey — only “I'm here” does. Until you tap it, Mira treats you as still on the way, and anyone following could be told you missed your check-in.", cards: [{ type: "trip_status", id: trip.id, destination: trip.destination.name, etaAt: trip.etaAt, state: trip.state }] },
        ]);
        return;
      }
    }
    setSending(true);
    // Every message goes to Mira (one door); a movement sentence also starts a plan draft she can finish in Plan.
    if (!urgent && !planActive && shouldSeedPlan(message)) {
      const timeZone = deviceTimeZone() ?? "UTC";
      const draft = draftFromAsk(message, newPlanDraft(new Date(), timeZone));
      if (user && /^\s*(?:take me home|go home|going home|walk home)\s*[?.!]*\s*$/i.test(message)) {
        const places = await api<{ places: Array<{ id: string; label: string; lat: number; lon: number }> }>("/api/me/places");
        const home = places.ok ? places.data.places.find((place) => /^home$/i.test(place.label.trim())) : null;
        if (home) draft.destination = { query: home.label, resolution: { source: "saved_place", name: home.label, point: { lat: home.lat, lon: home.lon }, placeId: home.id } };
      }
      setPlanDraft(draft);
    }
    recordUsage("mira");
    setInput("");
    const mine: Msg = { id: `u${Date.now()}`, role: "user", text: message, cards: [] };
    const reply: Msg = { id: `a${Date.now()}`, role: "assistant", text: "", cards: [], streaming: true };
    const location = planHydrated && loc.point ? { lat: loc.point.lat, lon: loc.point.lon } : null;
    // Decided before the first request, the same way the server decides, so even the first turn is private.
    if (user && (startPrivate.current || plan || location || shouldSeedPlan(message))) enterPrivate(mine.id);
    // The conversation so far, from this screen's memory: a guest's tab, or this private conversation only —
    // never her stored chats. The server's limits apply (8 turns, 2,000 characters each).
    const since = privateFrom.current ? msgs.findIndex((x) => x.id === privateFrom.current) : -1;
    const own = !user ? msgs : privateFrom.current ? (since >= 0 ? msgs.slice(since) : []) : null;
    const context = own?.filter((x) => !x.failed && x.text.trim()).slice(-8).map((x) => ({ role: x.role, text: x.text.slice(0, 2000) }));
    setMsgs((m) => [...m, mine, reply]);
    const now = new Date();
    try {
      const res = await fetch("/api/mira", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mira-request": "1" },
        body: JSON.stringify({ message, plan, ...(user && privateFrom.current ? { ephemeral: true, history: context } : {}), ...(!user ? { history: context, device: guestDevice() } : {}), context: { localTime: now.toISOString(), tzOffsetMin: now.getTimezoneOffset(), tz: deviceTimeZone(), location, area: planHydrated ? loc.area : null } }),
      });
      // The server can also decide a turn isn't kept (it has the final say): from then on the conversation is private.
      if (user && res.headers.get("x-mira-history") === "not_saved") enterPrivate(mine.id);
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

  // A question handed over from Home or a brief is asked once, as soon as the screen is ready.
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current || !planHydrated || (user && !loaded)) return;
    handed.current = true;
    const q = takeHandedOff();
    // A question about an outing or a place starts a private conversation, follow-ups included.
    if (q?.ephemeral) startPrivate.current = true;
    // Deferred a tick so the screen paints first; the question then streams in like any other.
    if (q) window.setTimeout(() => void send(q.text), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planHydrated, loaded, user]);

  const startTrip: StartTrip = async (dest) => {
    if (!user) return setSignIn(true);
    const l = await freshLocation();
    if (!l.point) return toast("Turn on location so I can start your trip.", "error");
    // A saved place travels as itself, so its live link shows it only roughly (audit P06-006).
    const r = await api("/api/trips", { body: { from: { lat: l.point.lat, lon: l.point.lon }, to: { name: dest.name, lat: dest.lat, lon: dest.lon }, share: false, ...tripStartExtras(dest.savedPlaceId) } });
    if (r.ok) {
      recordUsage("journey");
      router.push("/trip");
      router.refresh();
    } else if (r.code === "trip_active") {
      // Never swap in the other journey; say so in the chat with that journey's card to open (re-audit RA2: a toast had no way there).
      const current = await api<{ trip: { id: string; destination: { name: string }; etaAt: string; state: string } | null }>("/api/trips/current");
      const open = current.ok ? current.data.trip : null;
      const text = await activeTripMessage();
      setMsgs((m) => [...m, { id: `a${Date.now()}`, role: "assistant", text, cards: open ? [{ type: "trip_status", id: open.id, destination: open.destination.name, etaAt: open.etaAt, state: open.state }] : [] }]);
    }
    else toast(r.message, "error");
  };
  // Conversation → decision: hand the place to Plan, from where she is (only if location is already on).
  // The card's place keeps its provenance: a Google or unknown-source place stays in the tab, never in her account.
  const comparePlace = (d: { name: string; lat: number; lon: number; savedPlaceId?: string; placeId?: string }) => {
    planToCardPlace(d, here ? { lat: here.lat, lon: here.lon } : null);
    router.push("/plan?for=go");
  };

  // "Here" in her words becomes the plan's start only when she taps this (never assumed from GPS).
  const startHere = async () => {
    const l = await freshLocation();
    const draft = planDraft;
    if (!l.point || !draft) return toast(l.status === "denied" ? "Location is off for Mira. Choose the starting place in the plan instead." : "A fresh position isn’t available. Choose the starting place in the plan instead.", "error");
    setPlanDraft({ ...draft, origin: { kind: "device", use: "from_here", point: { lat: l.point.lat, lon: l.point.lon } } });
    router.push("/plan");
  };

  const empty = (user ? loaded : true) && msgs.length === 0;
  const night = useDaypart() === "night";
  const starters = night ? [...NIGHT_STARTERS, ...STARTERS] : STARTERS;
  // The same name the plan has in Plan, Home and Journeys, so it is clear which plan Mira means.
  const planLine = planDraft ? [planTitle(planDraft), planDraft.departureLocal && planDraft.timeZone ? whenWords(planDraft.departureLocal, planDraft.timeZone) : null].filter(Boolean).join(" · ") : "A plan in progress";

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <div className="z-10 bg-canvas px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-xl">
          <RootHeader emailAlerts={emailAlerts} leading={<MiraPulse size={22} state={sending ? "thinking" : "observing"} />} eyebrow={here ? `${loc.area ?? "Near you"}${clock ? ` · ${clockIn(clock)}` : ""}` : "Places, plans and what’s around"} title="Mira" />
          {planActive && (plan || planDraft?.loop || planDraft?.destination.query.trim() || (planDraft?.origin.kind === "named" && planDraft.origin.query.trim())) ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-accent-soft/70 px-3 py-2.5">
              <Icon name="route" className="size-5 shrink-0 text-accent-strong" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Your movement plan · {planLine}</p>
                <p className="truncate text-xs text-ink-muted">Movement plan questions use checked evidence and are not saved to chat history.</p>
              </div>
              <Link href="/plan" className="min-h-10 shrink-0 rounded-full bg-surface px-3 py-2 text-sm font-semibold text-accent-strong">Open</Link>
              <button type="button" onClick={clearPlanDraft} aria-label="Start a new plan" title="New plan" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-accent-strong"><Icon name="plus" className="size-[18px]" /></button>
            </div>
          ) : null}
        </div>
      </div>

      {/* The log isn't live (it would re-read every streamed word); each finished reply is announced once below. */}
      <p className="sr-only" aria-live="polite">{announce}</p>
      <div role="log" aria-live="off" aria-label="Conversation with Mira" className="flex-1 overflow-y-auto px-4 pb-[calc(var(--tabbar-space)+8.5rem)] pt-3">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {empty ? (
            <div className="animate-rise">
              {here && clock ? (
                <SkyCard state={skyAt(clock, here)} label="What Mira can see right now" eyebrow="What I can see right now" aside={loc.area ?? null} title={`${clockIn(clock)} · ${skyAt(clock, here) === "dark" ? "Dark now" : skyAt(clock, here) === "uncertain" ? "Twilight" : "Daylight"}`} strip={{ from: clock, point: here, hours: 12 }} className="mb-6" />
              ) : null}
              <p className="text-[1.625rem] font-semibold leading-tight tracking-[-0.035em]">Ask about a place, a time, or a plan.</p>
              <p className="mt-2 text-[0.9375rem] text-ink-muted">{night ? "It’s late. I can help you get home, find a Help Point, or check what’s open — and I’ll say what I can’t check." : "I answer with what I can check — daylight, lit streets, Help Points open then, local updates — and say what I can’t. I never call a place good or bad."}</p>
              <div className="mt-7 space-y-5">
                {starters.map((g) => (
                  <section key={g.title} aria-label={g.title}>
                    <h2 className="m-label flex items-center gap-1.5"><Icon name={g.icon} className="size-3.5" />{g.title}</h2>
                    <div className="mt-2 grid gap-2">
                      {g.asks.map((q) => (
                        <button key={q} type="button" onClick={() => void send(q)} disabled={sending} className="m-card m-press flex min-h-12 items-center gap-3 px-4 py-3 text-left text-[0.9375rem]">
                          <span className="flex-1">{q}</span><Icon name="arrow" className="size-4 text-ink-subtle" />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {!user ? <div className="mt-5"><GuestNote onSignIn={() => setSignIn(true)} /></div> : null}
            </div>
          ) : null}
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end animate-rise">
                <p className="max-w-[82%] rounded-[1.25rem] rounded-br-md bg-ink px-4 py-2.5 text-canvas text-mixed">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-3 animate-rise">
                <MiraPulse size={16} state={m.failed ? "attention" : m.streaming && !m.text ? "thinking" : "observing"} className="mt-[5px]" />
                <div className="min-w-0 flex-1">
                  <div className={cx(m.failed ? "rounded-2xl bg-warm-soft px-4 py-3 text-warm" : "")} role={m.failed ? "alert" : undefined}>
                    {m.text ? <p className="whitespace-pre-line text-[0.98rem] leading-relaxed text-mixed">{m.text}</p> : <span className="inline-flex gap-1" aria-label="Mira is checking"><span className="size-2 animate-bounce rounded-full bg-ink-subtle" /><span className="size-2 animate-bounce rounded-full bg-ink-subtle [animation-delay:120ms]" /><span className="size-2 animate-bounce rounded-full bg-ink-subtle [animation-delay:240ms]" /></span>}
                  </div>
                  {m.cards.map((c, i) => (
                    <Card key={i} card={c} onTrip={startTrip} onComparePlace={comparePlace} onStartHere={() => void startHere()} />
                  ))}
                </div>
              </div>
            ),
          )}
          {!empty && !user ? <GuestNote onSignIn={() => setSignIn(true)} /> : null}
          <div ref={endRef} className="h-px scroll-mb-56" />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[var(--tabbar-space)] z-30 bg-gradient-to-t from-canvas from-70% to-transparent px-4 pb-3 pt-5">
        <div className="mx-auto max-w-xl">
          {user && !here ? <button type="button" onClick={() => void loc.request()} className="mb-2 min-h-11 text-sm font-semibold text-accent-strong">Use current location for nearby questions</button> : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 rounded-[1.5rem] bg-surface p-1.5 pl-4 shadow-[var(--shadow-float)] ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-accent"
          >
            <label htmlFor="mira-input" className="sr-only">Message Mira</label>
            <input id="mira-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Message Mira…" autoComplete="off" className="min-h-11 flex-1 bg-transparent text-base outline-none" />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send" className={cx("grid size-11 place-items-center rounded-full transition-colors", input.trim() ? "bg-accent text-accent-ink" : "bg-sunken text-ink-subtle")}>
              <Icon name="send" className="size-5" />
            </button>
          </form>
          {user && isPrivate ? (
            <div role="status" className="mt-1.5 flex items-center justify-between gap-2 px-2">
              <p className="text-[0.7rem] leading-snug text-ink-subtle">Private conversation: nothing here is saved. Mira remembers it only while this screen is open.</p>
              <button type="button" onClick={newConversation} disabled={sending} className="min-h-11 shrink-0 text-xs font-semibold text-accent-strong">New conversation</button>
            </div>
          ) : null}
          <p className="mt-1.5 px-2 text-[0.7rem] leading-snug text-ink-subtle">Messages may be read by the configured AI provider. {!user ? "As a guest, nothing here is saved." : isPrivate ? "Your other chats are kept for 30 days." : "Questions about plans, places or where you are start a private conversation that isn’t saved; other chats are kept for 30 days."} <Link href="/privacy" className="underline">Data details</Link></p>
        </div>
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to talk to Mira" />
    </div>
  );
}
