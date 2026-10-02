"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/app/Avatar";
import { SignInSheet } from "@/components/app/SignInSheet";
import { AppearancePicker } from "@/components/app/AppearancePicker";
import { InstallCard } from "@/components/pwa/InstallCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { freshLocation } from "@/lib/location-store";
import { resetLocalPersonalisation } from "@/lib/usage-signal";
import type { SavedPlace } from "@/server/account/places";
import { MAX_SAVED_PLACES } from "@/domain/limits";
import type { Contact } from "@/server/account/contacts";
import { HELP_CLASSES, type HelpClass } from "@/domain/help-points";
import { HELP_ICON } from "@/components/app/kinds";
import { Section } from "@/components/app/Section";
import { AccountSection, PushSection } from "./MeSections";
import { CircleRow, PersonalSections } from "./PersonalSections";
import { ImpactRow } from "./ImpactRow";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import type { ProviderModes } from "@/server/providers/modes";

const EMOJIS = [
  ["🏠", "Home"],
  ["🎓", "College"],
  ["💼", "Work"],
  ["🏋️", "Gym"],
  ["⭐", "Favourite"],
] as const;


export function MeScreen({
  user,
  places: initialPlaces,
  contacts: initialContacts,
  modes,
  emailAlerts,
  saved = false,
  switchPreserved = false,
}: {
  user: { id: string; name: string; avatarUrl: string | null; durable: boolean; google: boolean; emailHint: string | null; helpExclude: string[] } | null;
  places: SavedPlace[];
  contacts: Contact[];
  modes: ProviderModes;
  /** Whether Mira can send email at all (production SMTP configured). */
  emailAlerts: boolean;
  /** Just came back from adding an email to this account. */
  saved?: boolean;
  switchPreserved?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [places, setPlaces] = useState(initialPlaces);
  const contacts = initialContacts;
  const [exclude, setExclude] = useState<HelpClass[]>((user?.helpExclude ?? []) as HelpClass[]);
  const [addingPlace, setAddingPlace] = useState(false);
  const [placeLabel, setPlaceLabel] = useState("Home");
  const [placeEmoji, setPlaceEmoji] = useState("🏠");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const isDemo = !user?.durable; // no email login: there's no way back in after signing out
  const [signIn, setSignIn] = useState(false);

  if (!user) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-[calc(var(--tabbar-space)+2rem)] text-center">
        <h1 className="text-[1.75rem] font-semibold">Make Mira yours</h1>
        <p className="mt-2 max-w-sm text-ink-muted">Save the places you go and the people you trust, so sharing a trip is one tap.</p>
        <Button className="mt-7 max-w-xs" variant="primary" size="lg" onClick={() => setSignIn(true)}>
          Get started
        </Button>
        <SafetyAccess emailAlerts={emailAlerts} className="mt-5" />
        <SignInSheet open={signIn} onClose={() => setSignIn(false)} />
      </div>
    );
  }

  const addPlace = async () => {
    setBusy("place");
    const l = await freshLocation();
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

  return (
    <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex items-center gap-4 pt-2 animate-rise">
          <Avatar name={user.name} src={user.avatarUrl} size={68} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold">{user.name}</h1>
            <p className="text-ink-muted">
              {places.length} place{places.length === 1 ? "" : "s"} ·{" "}
              <Link href="/circle" className="font-semibold text-accent">
                {contacts.filter((c) => c.status === "accepted").length} in your circle
              </Link>
            </p>
          </div>
        </header>
        <SafetyAccess emailAlerts={emailAlerts} />

        <CircleRow accepted={contacts.filter((c) => c.status === "accepted").length} invited={contacts.filter((c) => c.status === "invited").length} />
        <Section
          id="places"
          title="Your places"
          action={
            places.length >= MAX_SAVED_PLACES && !addingPlace ? (
              <span className="text-sm font-semibold text-ink-subtle">
                {MAX_SAVED_PLACES} of {MAX_SAVED_PLACES}
              </span>
            ) : (
              <button type="button" onClick={() => setAddingPlace((v) => !v)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-accent-strong">
                {addingPlace ? "Cancel" : "+ Add"}
              </button>
            )
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
              <label className="mt-3 block text-sm font-semibold" htmlFor="place-label">
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
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block truncate text-sm text-ink-muted">{p.address ?? "Pinned on the map"}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.label}`}
                    disabled={removing === p.id}
                    onClick={async () => {
                      setRemoving(p.id);
                      const r = await api(`/api/me/places/${p.id}`, { method: "DELETE" });
                      setRemoving(null);
                      if (r.ok) setPlaces((xs) => xs.filter((x) => x.id !== p.id));
                      else toast(r.message, "error");
                    }}
                    className="grid size-11 place-items-center rounded-full text-ink-subtle hover:bg-sunken disabled:opacity-50"
                  >
                    <Icon name="trash" className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="contributing" title="Contributing">
          <ul className="divide-y divide-line">
            <li><Link href="/contribute" className="flex min-h-14 items-center gap-3 px-5 hover:bg-sunken"><Icon name="contribute" className="text-accent" /> <span className="flex-1 font-semibold">Contribute a place check</span> <Icon name="chevron" className="size-4 text-ink-subtle" /></Link></li>
            <li>
              <ImpactRow />
            </li>
            <li>
              <Link href="/report?from=me" className="flex min-h-14 items-center gap-3 px-5 hover:bg-sunken">
                <Icon name="flag" className="text-accent" /> <span className="flex-1 font-semibold">Report something</span> <Icon name="chevron" className="size-4 text-ink-subtle" />
              </Link>
            </li>
          </ul>
        </Section>

        <PersonalSections />

        <Section id="help" title="Help Points">
          <div className="p-5">
            <p className="text-sm text-ink-muted">Kinds of places Mira suggests when you feel unsafe and along your routes. Turn off any you&apos;d rather not be pointed to.</p>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(HELP_CLASSES) as HelpClass[]).map((c) => {
                const on = !exclude.includes(c);
                return (
                  <li key={c}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={async () => {
                        const next = on ? [...exclude, c] : exclude.filter((x) => x !== c);
                        setExclude(next);
                        const r = await api("/api/me", { method: "PATCH", body: { helpExclude: next } });
                        if (!r.ok) {
                          setExclude(exclude);
                          toast(r.message, "error");
                        }
                      }}
                      className={cx("flex min-h-12 w-full items-center gap-2 rounded-[var(--radius-control)] border px-3 text-left text-sm font-medium", on ? "border-accent/40 bg-accent-soft text-ink" : "border-line text-ink-muted line-through")}
                    >
                      <Icon name={HELP_ICON[c] ?? "pin"} className="size-4" /> {HELP_CLASSES[c].label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>

        {switchPreserved ? <p role="alert" className="rounded-2xl bg-warm-soft px-5 py-4 text-sm text-ink">This Google sign-in belongs to another Mira account. Your current account and its places, contacts, and journeys were kept here. To keep this account after signing out, upgrade it with a different Google account or email first; then you can switch accounts. Mira does not merge contribution identities automatically.</p> : null}
        <AccountSection durable={user.durable} google={user.google} emailHint={user.emailHint} emailAvailable={emailAlerts} googleAvailable={modes.auth === "google"} saved={saved} />


        <PushSection available={modes.push === "web_push"} />

        <Section id="app" title="App">
          <div className="divide-y divide-line">
            <AppearancePicker />
            <InstallCard variant="row" />
          </div>
        </Section>

        <Section id="privacy" title="Privacy">
          <ul className="divide-y divide-line">
            <li>
              <Link href="/privacy" className="flex min-h-14 items-center gap-3 px-5 hover:bg-sunken">
                <Icon name="shield" className="text-accent" /> <span className="flex-1 font-semibold">How Mira handles your data</span> <Icon name="chevron" className="size-4 text-ink-subtle" />
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
              {confirmSignOut ? (
                <div className="px-5 py-4">
                  <p className="font-semibold">
                    {isDemo
                      ? "This account has no email, so there's no way back in after signing out — signing out deletes it (places, contacts, trips, chat). Add your email above to keep it."
                      : "Sign out on this device?"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      busy={busy === "signout"}
                      onClick={async () => {
                        setBusy("signout");
                        const r = await api("/api/auth/signout", { body: {} });
                        setBusy(null);
                        if (!r.ok) return toast(r.message, "error");
                        resetLocalPersonalisation();
                        router.push("/");
                        router.refresh();
                      }}
                    >
                      {isDemo ? "Sign out & delete" : "Sign out"}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmSignOut(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmSignOut(true)} className="flex min-h-14 w-full items-center gap-3 px-5 text-left hover:bg-sunken">
                  <Icon name="signout" className="text-ink-muted" /> <span className="flex-1 font-semibold">Sign out</span>
                </button>
              )}
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
                        const r = await api("/api/me", { method: "DELETE" });
                        setBusy(null);
                        if (!r.ok) return toast(`Your account wasn't deleted: ${r.message}`, "error");
                        resetLocalPersonalisation();
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
                <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 text-sm font-semibold text-ink-muted hover:text-error">
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
