"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MiraOrb } from "@/components/app/MiraOrb";
import { SignInSheet } from "@/components/app/SignInSheet";
import { kindEmoji } from "@/components/app/kinds";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { requestLocation, setPendingDestination, useLocation } from "@/lib/location-store";
import type { MiraCard } from "@/server/providers/companion/types";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: MiraCard[];
  streaming?: boolean;
}

const QUICK = ["Take me home", "Pharmacy near me", "I feel uneasy", "Report something"];
const fmtM = (m?: number) => (m === undefined ? "" : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

function Card({ card, onTrip }: { card: MiraCard; onTrip: (d: { name: string; lat: number; lon: number }) => void }) {
  const router = useRouter();
  switch (card.type) {
    case "trip":
      return (
        <div className="mt-2 rounded-3xl bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Share trip</p>
          <p className="mt-1 text-lg font-extrabold">To {card.destination.name}</p>
          <p className="text-sm text-ink-muted">
            {card.minutes ? `About ${card.minutes} min walk · ` : ""}
            {card.contacts.length ? `${card.contacts.join(", ")} can follow live` : "Private — I'll check you arrive"}
          </p>
          <Button className="mt-3" variant="hero" onClick={() => onTrip(card.destination)}>
            <Icon name="share" className="size-4" /> {card.contacts.length ? "Share my trip" : "Start my trip"}
          </Button>
        </div>
      );
    case "places":
      return (
        <div className="mt-2 overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
          <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wider text-ink-subtle">{card.title}</p>
          <ul className="divide-y divide-line">
            {card.places.map((p) => (
              <li key={`${p.name}-${p.lat}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPendingDestination({ name: p.name, lat: p.lat, lon: p.lon, kind: p.kind });
                    router.push("/");
                  }}
                  className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken"
                >
                  <span className="text-xl" aria-hidden>
                    {kindEmoji(p.kind)}
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
    case "report":
      return (
        <Link href={`/report?c=${card.category}`} className="mt-2 flex items-center gap-3 rounded-3xl bg-surface p-4 font-bold shadow-[var(--shadow-card)]">
          <span className="grid size-10 place-items-center rounded-2xl bg-peach-soft text-xl">📝</span>
          <span className="flex-1">Report {card.label} privately</span>
          <Icon name="chevron" className="size-4 text-ink-subtle" />
        </Link>
      );
    case "sos":
      return (
        <div className="mt-2 rounded-3xl bg-warm-soft p-4">
          <a href="tel:112" className="flex min-h-13 items-center justify-center gap-2 rounded-full bg-ink px-5 text-lg font-extrabold text-white">
            Call 112
          </a>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {card.contacts.length ? `Or share your trip below so ${card.contacts.join(", ")} can see where you are.` : "Add trusted contacts in Me so I can alert them next time."}
          </p>
        </div>
      );
    case "trip_status":
      return (
        <Link href="/trip" className="mt-2 flex items-center gap-3 rounded-3xl bg-mira p-4 text-white shadow-[var(--shadow-float)]">
          <span className="flex-1">
            <span className="block font-extrabold">On the way to {card.destination}</span>
            <span className="block text-sm text-white/85">ETA {new Date(card.etaAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </span>
          <Icon name="chevron" />
        </Link>
      );
    case "save_place":
      return (
        <Link href="/me#places" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 font-bold text-white">
          🏠 Save my home
        </Link>
      );
  }
}

export function MiraChat({ user }: { user: { name: string; avatarUrl: string | null } | null }) {
  const router = useRouter();
  const toast = useToast();
  const loc = useLocation(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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
    if (!user) return setSignIn(true);
    setInput("");
    setSending(true);
    const mine: Msg = { id: `u${Date.now()}`, role: "user", text: message, cards: [] };
    const reply: Msg = { id: `a${Date.now()}`, role: "assistant", text: "", cards: [], streaming: true };
    setMsgs((m) => [...m, mine, reply]);
    const now = new Date();
    try {
      const res = await fetch("/api/mira", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mira-request": "1" },
        body: JSON.stringify({ message, context: { localTime: now.toISOString(), tzOffsetMin: now.getTimezoneOffset(), location: loc.point ? { lat: loc.point.lat, lon: loc.point.lon } : null, area: loc.area } }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Mira couldn't reply just now.");
      }
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
        }
      }
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === reply.id ? { ...x, text: e instanceof Error ? e.message : "Something went wrong.", streaming: false } : x)));
    }
    setSending(false);
  };

  const startTrip = async (dest: { name: string; lat: number; lon: number }) => {
    const l = loc.point ? loc : await requestLocation();
    if (!l.point) return toast("Turn on location so I can start your trip.", "error");
    const r = await api("/api/trips", { body: { from: { lat: l.point.lat, lon: l.point.lon }, to: dest, share: true } });
    if (r.ok || r.code === "trip_active") {
      router.push("/trip");
      router.refresh();
    } else toast(r.message, "error");
  };

  const firstName = user?.name.split(" ")[0];

  return (
    <div className="bg-companion flex h-dvh flex-col">
      <header className="glass z-10 flex items-center gap-3 border-b border-white/60 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <MiraOrb size={44} />
        <div>
          <h1 className="text-xl font-extrabold leading-tight">Mira</h1>
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <span className="size-2 rounded-full bg-mint" /> Your walking companion
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-44 pt-4" aria-live="polite">
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          {(!user || (loaded && msgs.length === 0)) && (
            <div className="animate-rise">
              <div className="flex items-end gap-2">
                <MiraOrb size={30} calm />
                <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
                  <p>
                    Hi{firstName ? ` ${firstName}` : ""}! I&apos;m Mira 👋 I can share your trip live with people you trust, find what&apos;s open nearby, or help you report
                    something privately. What do you need?
                  </p>
                </div>
              </div>
            </div>
          )}
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end animate-rise">
                <p className="max-w-[80%] rounded-3xl rounded-br-md bg-accent px-4 py-2.5 text-white text-mixed">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="flex items-end gap-2 animate-rise">
                <MiraOrb size={30} calm />
                <div className="min-w-0 max-w-[85%]">
                  <div className="rounded-3xl rounded-bl-md bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
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

      <div className="fixed inset-x-0 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-30 px-4">
        <div className="mx-auto max-w-xl">
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => send(q)} className="shrink-0 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-[var(--shadow-card)] hover:border-accent/40">
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="glass flex items-center gap-2 rounded-full border border-white/70 p-1.5 pl-5 shadow-[var(--shadow-float)]"
          >
            <label htmlFor="mira-input" className="sr-only">
              Message Mira
            </label>
            <input id="mira-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Message Mira…" autoComplete="off" className="min-h-11 flex-1 bg-transparent text-base outline-none" />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send" className={cx("grid size-11 place-items-center rounded-full text-white transition-all", input.trim() ? "bg-mira" : "bg-line-strong")}>
              <Icon name="send" className="size-5" />
            </button>
          </form>
        </div>
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to chat with Mira" />
    </div>
  );
}
