"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/app/Avatar";
import { MiraOrb } from "@/components/app/MiraOrb";
import { SignInSheet } from "@/components/app/SignInSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { requestLocation, useLocation } from "@/lib/location-store";
import type { SavedPlace } from "@/server/account/places";
import type { Contact } from "@/server/account/contacts";
import type { ProviderModes } from "@/server/providers/modes";

const EMOJIS = [
  ["🏠", "Home"],
  ["🎓", "College"],
  ["💼", "Work"],
  ["🏋️", "Gym"],
  ["⭐", "Favourite"],
] as const;

function Section({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id={`${id}-h`} className="text-sm font-bold uppercase tracking-wider text-ink-subtle">
          {title}
        </h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">{children}</div>
    </section>
  );
}

export function MeScreen({
  user,
  places: initialPlaces,
  contacts: initialContacts,
  modes,
}: {
  user: { id: string; name: string; avatarUrl: string | null } | null;
  places: SavedPlace[];
  contacts: Contact[];
  modes: ProviderModes;
}) {
  const router = useRouter();
  const toast = useToast();
  const loc = useLocation(false);
  const [places, setPlaces] = useState(initialPlaces);
  const [contacts, setContacts] = useState(initialContacts);
  const [addingPlace, setAddingPlace] = useState(false);
  const [placeLabel, setPlaceLabel] = useState("Home");
  const [placeEmoji, setPlaceEmoji] = useState("🏠");
  const [addingContact, setAddingContact] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [signIn, setSignIn] = useState(false);

  if (!user) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-32 text-center">
        <MiraOrb size={80} />
        <h1 className="mt-6 text-3xl font-extrabold">Make MIRA yours</h1>
        <p className="mt-2 max-w-sm text-ink-muted">Save the places you go and the people you trust, so sharing a trip is one tap.</p>
        <Button className="mt-7 max-w-xs" variant="hero" size="lg" onClick={() => setSignIn(true)}>
          Get started
        </Button>
        <SignInSheet open={signIn} onClose={() => setSignIn(false)} />
      </div>
    );
  }

  const demoItems = [
    modes.auth === "demo" && "sign-in (Google coming)",
    modes.maps === "placeholder" && "maps & search (Mapbox coming)",
    modes.companion === "placeholder" && "Mira's brain (Claude coming)",
    modes.push === "in_app" && "notifications (push coming)",
  ].filter(Boolean);

  const addPlace = async () => {
    setBusy("place");
    const l = loc.point ? loc : await requestLocation();
    if (!l.point) {
      setBusy(null);
      return toast("I need your location to save this spot. You can also save places from the map.", "error");
    }
    const r = await api<{ place: SavedPlace }>("/api/me/places", { body: { label: placeLabel.trim() || "Place", emoji: placeEmoji, lat: l.point.lat, lon: l.point.lon } });
    setBusy(null);
    if (r.ok) {
      setPlaces((p) => [...p, r.data.place]);
      setAddingPlace(false);
      toast(`Saved ${r.data.place.label}`);
    } else toast(r.message, "error");
  };

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("contact");
    const r = await api<{ contact: Contact }>("/api/me/contacts", { body: { name: cName.trim(), email: cEmail.trim() } });
    setBusy(null);
    if (r.ok) {
      setContacts((c) => [...c, r.data.contact]);
      setCName("");
      setCEmail("");
      setAddingContact(false);
      toast(r.data.contact.status === "invited" ? `Invite sent to ${r.data.contact.name}` : "Saved — but the invite email couldn't be sent", r.data.contact.status === "invited" ? "info" : "error");
    } else toast(r.message, "error");
  };

  return (
    <div className="bg-companion min-h-dvh px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex items-center gap-4 pt-2 animate-rise">
          <Avatar name={user.name} src={user.avatarUrl} size={68} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-extrabold">{user.name}</h1>
            <p className="text-ink-muted">
              {places.length} place{places.length === 1 ? "" : "s"} · {contacts.filter((c) => c.status === "accepted").length} trusted contact
              {contacts.filter((c) => c.status === "accepted").length === 1 ? "" : "s"}
            </p>
          </div>
        </header>

        {demoItems.length ? (
          <details className="rounded-3xl bg-accent-soft px-5 py-3">
            <summary className="min-h-10 cursor-pointer py-2 font-bold text-accent-strong">✨ Demo mode</summary>
            <p className="pb-2 text-sm text-ink-muted">Everything works end to end. These parts use stand-ins until the real services are connected: {demoItems.join(", ")}.</p>
          </details>
        ) : null}

        <Section
          id="places"
          title="Your places"
          action={
            <button type="button" onClick={() => setAddingPlace((v) => !v)} className="min-h-10 rounded-full px-3 text-sm font-bold text-accent">
              {addingPlace ? "Cancel" : "+ Add"}
            </button>
          }
        >
          {addingPlace ? (
            <div className="border-b border-line p-5">
              <p className="font-semibold">Save where you are right now as…</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EMOJIS.map(([e, l]) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setPlaceEmoji(e);
                      setPlaceLabel(l);
                    }}
                    className={cx("min-h-11 rounded-full border px-4 font-semibold", placeEmoji === e ? "border-accent bg-accent-soft" : "border-line")}
                  >
                    {e} {l}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-sm font-bold" htmlFor="place-label">
                Name
              </label>
              <input id="place-label" value={placeLabel} maxLength={40} onChange={(e) => setPlaceLabel(e.target.value)} className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-sunken px-4 outline-none focus:border-accent" />
              <Button className="mt-4" variant="primary" size="lg" onClick={addPlace} busy={busy === "place"} busyLabel="Finding you…">
                <Icon name="locate" className="size-5" /> Save my current spot
              </Button>
              <p className="mt-2 text-center text-xs text-ink-subtle">Tip: you can also save any place you search for on the map.</p>
            </div>
          ) : null}
          {places.length === 0 && !addingPlace ? (
            <p className="p-5 text-ink-muted">Save Home, College or anywhere you go often — then sharing a trip there is one tap.</p>
          ) : (
            <ul className="divide-y divide-line">
              {places.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-xl">{p.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{p.label}</span>
                    <span className="block truncate text-sm text-ink-muted">{p.address ?? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.label}`}
                    onClick={async () => {
                      const r = await api(`/api/me/places/${p.id}`, { method: "DELETE" });
                      if (r.ok) setPlaces((xs) => xs.filter((x) => x.id !== p.id));
                    }}
                    className="grid size-11 place-items-center rounded-full text-ink-subtle hover:bg-sunken"
                  >
                    <Icon name="trash" className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          id="contacts"
          title="Trusted contacts"
          action={
            <button type="button" onClick={() => setAddingContact((v) => !v)} className="min-h-10 rounded-full px-3 text-sm font-bold text-accent">
              {addingContact ? "Cancel" : "+ Add"}
            </button>
          }
        >
          {addingContact ? (
            <form onSubmit={addContact} className="border-b border-line p-5">
              <label className="block text-sm font-bold" htmlFor="c-name">
                Name
              </label>
              <input id="c-name" required value={cName} maxLength={60} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Mum" className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-sunken px-4 outline-none focus:border-accent" />
              <label className="mt-3 block text-sm font-bold" htmlFor="c-email">
                Email
              </label>
              <input id="c-email" required type="email" inputMode="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-sunken px-4 outline-none focus:border-accent" />
              <p className="mt-2 text-sm text-ink-muted">They&apos;ll get a one-time invite. Once they accept, they can follow the trips you choose to share — and nothing else.</p>
              <Button type="submit" className="mt-4" variant="primary" size="lg" busy={busy === "contact"} busyLabel="Sending invite…" disabled={!cName.trim() || !cEmail.trim()}>
                Send invite
              </Button>
            </form>
          ) : null}
          {contacts.length === 0 && !addingContact ? (
            <p className="p-5 text-ink-muted">Add someone you trust. When you share a trip, they can follow along live until you arrive.</p>
          ) : (
            <ul className="divide-y divide-line">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={c.name} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{c.name}</span>
                    <span className="block truncate text-sm text-ink-muted">{c.emailHint}</span>
                  </span>
                  <span
                    className={cx(
                      "rounded-full px-3 py-1 text-xs font-bold",
                      c.status === "accepted" ? "bg-mint-soft text-mint" : c.status === "invited" ? "bg-sunken text-ink-muted" : "bg-error-soft text-error",
                    )}
                  >
                    {c.status === "accepted" ? "Trusted" : c.status === "invited" ? "Invited" : "Invite failed"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    onClick={async () => {
                      const r = await api(`/api/me/contacts/${c.id}`, { method: "DELETE" });
                      if (r.ok) setContacts((xs) => xs.filter((x) => x.id !== c.id));
                    }}
                    className="grid size-11 place-items-center rounded-full text-ink-subtle hover:bg-sunken"
                  >
                    <Icon name="trash" className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="privacy" title="Privacy">
          <ul className="divide-y divide-line">
            <li>
              <Link href="/privacy" className="flex min-h-14 items-center gap-3 px-5 hover:bg-sunken">
                <Icon name="shield" className="text-accent" /> <span className="flex-1 font-semibold">How MIRA handles your data</span> <Icon name="chevron" className="size-4 text-ink-subtle" />
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={async () => {
                  const r = await api("/api/mira", { method: "DELETE" });
                  toast(r.ok ? "Mira's chat history cleared" : r.message, r.ok ? "info" : "error");
                }}
                className="flex min-h-14 w-full items-center gap-3 px-5 text-left hover:bg-sunken"
              >
                <Icon name="sparkle" className="text-accent" /> <span className="flex-1 font-semibold">Clear my chat with Mira</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={async () => {
                  await api("/api/auth/signout", { body: {} });
                  router.push("/");
                  router.refresh();
                }}
                className="flex min-h-14 w-full items-center gap-3 px-5 text-left hover:bg-sunken"
              >
                <Icon name="back" className="text-ink-muted" /> <span className="flex-1 font-semibold">Sign out</span>
              </button>
            </li>
            <li className="px-5 py-4">
              {confirmDelete ? (
                <div>
                  <p className="font-semibold">Delete your account? Your places, contacts, trips and chat are erased. This can&apos;t be undone.</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      busy={busy === "delete"}
                      onClick={async () => {
                        setBusy("delete");
                        await api("/api/me", { method: "DELETE" });
                        router.push("/");
                        router.refresh();
                      }}
                    >
                      Delete everything
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-10 text-sm font-bold text-ink-muted hover:text-error">
                  Delete my account
                </button>
              )}
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
