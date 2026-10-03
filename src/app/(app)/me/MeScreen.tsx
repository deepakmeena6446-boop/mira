"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/app/Avatar";
import { SignInSheet } from "@/components/app/SignInSheet";
import { AppearancePicker } from "@/components/app/AppearancePicker";
import { InstallCard } from "@/components/pwa/InstallCard";
import { HELP_ICON } from "@/components/app/kinds";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Sheet, StateNote } from "@/components/mira/Frame";
import { Chip, Group, GroupRow, Row, RowAction, RowList } from "@/components/mira/Rows";
import { api } from "@/lib/api-client";
import { freshLocation } from "@/lib/location-store";
import { useCountry } from "@/lib/locale-store";
import { clearDevicePersonalState } from "@/lib/clear-device-personal-state";
import { emergencyActions } from "@/domain/country-context";
import { MAX_SAVED_PLACES } from "@/domain/limits";
import { HELP_CLASSES, type HelpClass } from "@/domain/help-points";
import type { SavedPlace } from "@/server/account/places";
import type { Contact } from "@/server/account/contacts";
import type { ImpactView } from "@/server/contributions";
import type { ProviderModes } from "@/server/providers/modes";
import { AccountSection, PushSection } from "./MeSections";
import { PersonalSections } from "./PersonalSections";

const EMOJIS = [["🏠", "Home"], ["🎓", "College"], ["💼", "Work"], ["🏋️", "Gym"], ["⭐", "Favourite"]] as const;
/** The kinds a person can turn off (the API's list; airports and stores aren't suggested as help on their own). */
const EXCLUDABLE: HelpClass[] = ["hospital", "police", "transit", "hotel", "pharmacy", "fuel"];
const CONTACT_STATE: Record<Contact["status"], string> = { accepted: "Trusted · can follow when you share", phone: "On WhatsApp · you send the link", invited: "Invited · hasn’t accepted yet", invite_failed: "Invite didn’t send" };

/**
 * You (docs/phase2-ux/00 §2): who you are to Mira, the people and places that make a journey one tap,
 * what you've added, how Mira behaves for you, the numbers that work where you are, and your data.
 */
export function MeScreen({ user, places: initialPlaces, contacts, modes, emailAlerts, saved = false, switchPreserved = false }: {
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
  const country = useCountry();
  const [places, setPlaces] = useState(initialPlaces);
  const [exclude, setExclude] = useState<HelpClass[]>((user?.helpExclude ?? []) as HelpClass[]);
  const [sheet, setSheet] = useState<"place" | "signout" | "delete" | null>(null);
  const [placeLabel, setPlaceLabel] = useState("Home");
  const [placeEmoji, setPlaceEmoji] = useState("🏠");
  const [busy, setBusy] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [impact, setImpact] = useState<ImpactView | null>(null);
  const isDemo = !user?.durable; // no email login: there's no way back in after signing out

  useEffect(() => {
    if (!user) return;
    let live = true;
    void api<{ impact: ImpactView }>("/api/contribute").then((r) => { if (live && r.ok) setImpact(r.data.impact); });
    return () => { live = false; };
  }, [user]);

  const header = (
    <header className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => router.back()} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line"><Icon name="back" className="size-5" /></button>
      <SafetyAccess emailAlerts={emailAlerts} compact className="min-w-0" />
    </header>
  );

  const actions = emergencyActions(country);
  const emergency = (
    <Group id="emergency" label={country.countryName ? `Emergency in ${country.countryName}` : "Emergency where you are"} className="mt-7" note={country.iso ? "From Mira’s reviewed country profile. Your phone’s own emergency call works everywhere." : undefined}>
      {country.iso && (actions.length || country.helplines.length) ? (
        <>
          {actions.map((a) => <GroupRow key={a.number} icon="phone" tone="warm" title={`${a.number} · ${a.label}`} detail={a.qualification ?? null} href={`tel:${a.number}`} ariaLabel={`Call ${a.label}, ${a.number}`} />)}
          {country.helplines.map((h) => <GroupRow key={h.number} icon="phone" tone="ink" title={`${h.number} · ${h.name}`} detail={h.hours} href={`tel:${h.number}`} ariaLabel={`Call ${h.name}, ${h.number}`} />)}
        </>
      ) : (
        <GroupRow icon="phone" tone="ink" title="Numbers show once your location is on" detail="Your phone’s own emergency call always works — it doesn’t need Mira." />
      )}
    </Group>
  );

  if (!user) {
    return (
      <div className="m-screen bg-companion">
        <div className="m-screen-inner">
          {header}
          <section aria-labelledby="you-h" className="m-card mt-5 p-5">
            <h1 id="you-h" className="m-display">Make Mira yours</h1>
            <p className="m-meta mt-2 text-[0.95rem]">Save the places you go and the people you trust, so going with Mira is one tap. Your private check-in works without an account.</p>
            <button type="button" onClick={() => setSignIn(true)} className="mira-primary mt-5 w-full">Get started</button>
          </section>
          {emergency}
          <Group id="app" label="App" className="mt-7"><AppearancePicker /><InstallCard variant="row" /></Group>
          <Group id="privacy" label="Privacy" className="mt-7"><GroupRow icon="shield" title="How Mira handles your data" href="/privacy" /></Group>
        </div>
        <SignInSheet open={signIn} onClose={() => setSignIn(false)} />
      </div>
    );
  }

  const addPlace = async () => {
    setBusy("place");
    const l = await freshLocation();
    if (!l.point) { setBusy(null); return toast("I need your location to save this spot. You can also save a place you check in Around.", "error"); }
    const r = await api<{ place: SavedPlace }>("/api/me/places", { body: { label: placeLabel.trim() || "Place", emoji: placeEmoji, lat: l.point.lat, lon: l.point.lon } });
    setBusy(null);
    if (!r.ok) return toast(r.message, "error");
    setPlaces((p) => [...p, r.data.place]);
    setSheet(null);
    toast(`Saved ${r.data.place.label}`);
  };
  const removePlace = async (p: SavedPlace) => {
    setBusy(p.id);
    const r = await api(`/api/me/places/${p.id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) setPlaces((xs) => xs.filter((x) => x.id !== p.id));
    else toast(r.message, "error");
  };
  const leave = async (kind: "signout" | "delete") => {
    setBusy(kind);
    const r = kind === "signout" ? await api("/api/auth/signout", { body: {} }) : await api("/api/me", { method: "DELETE" });
    setBusy(null);
    if (!r.ok) return toast(kind === "delete" ? `Your account wasn’t deleted: ${r.message}` : r.message, "error");
    clearDevicePersonalState();
    router.push("/");
    router.refresh();
  };
  const accepted = contacts.filter((c) => c.status === "accepted" || c.status === "phone");

  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner">
        {header}

        {/* Who you are to Mira. */}
        <section aria-labelledby="you-h" className="m-card mt-5 flex items-center gap-4 p-4">
          <Avatar name={user.name} src={user.avatarUrl} size={56} />
          <div className="min-w-0 flex-1">
            <h1 id="you-h" className="m-title truncate">{user.name}</h1>
            <p className="m-meta">{user.durable ? (user.google ? "Signed in with Google" : `Signed in${user.emailHint ? ` as ${user.emailHint}` : ""}`) : "This account lives in this browser only"}</p>
          </div>
          {!user.durable ? <a href="#account" className="shrink-0 rounded-full bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-strong">Keep it</a> : null}
        </section>
        {switchPreserved ? <StateNote tone="attention" role="alert" className="mt-3" title="That Google account belongs to another Mira account">Your current account and its places, people and journeys were kept here. To keep this account after signing out, upgrade it with a different Google account or email first; Mira never merges accounts automatically.</StateNote> : null}

        {/* The people who can follow your journeys. */}
        <RowList label="Your Circle" id="circle-h" className="mt-7" action={<a href="/circle" className="text-sm font-semibold text-accent-strong">Manage</a>}>
          {contacts.slice(0, 3).map((c) => <Row key={c.id} icon="user" tone={c.status === "accepted" || c.status === "phone" ? "people" : "ink"} eyebrow={CONTACT_STATE[c.status]} title={c.name} detail={c.phoneHint ?? c.emailHint ?? undefined} href="/circle" ariaLabel={`${c.name}: ${CONTACT_STATE[c.status]}`} />)}
          {contacts.length > 3 ? <Row icon="community" tone="ink" title={`${contacts.length - 3} more in your Circle`} href="/circle" /> : null}
          {!contacts.length ? <Row icon="plus" tone="ink" title="Add someone you trust" detail="They get your live link only when you choose to share" href="/circle" /> : null}
        </RowList>
        {contacts.length ? <p className="m-meta mt-2 px-1">{accepted.length ? `${accepted.length} can follow when you share. ` : ""}Nobody is ever shared with by default — you choose each time.</p> : null}

        {/* Places that make planning one tap. */}
        <RowList label="Your places" id="places-h" className="mt-7" action={places.length < MAX_SAVED_PLACES ? <button type="button" onClick={() => setSheet("place")} className="text-sm font-semibold text-accent-strong">Add</button> : <span className="m-meta">{MAX_SAVED_PLACES} of {MAX_SAVED_PLACES}</span>}>
          {places.map((p) => <PlaceRow key={p.id} place={p} busy={busy === p.id} onRemove={() => void removePlace(p)} />)}
          {!places.length ? <Row icon="pin" tone="ink" title="Save Home, College or Work" detail="Then going there with Mira is one tap" onClick={() => setSheet("place")} /> : null}
        </RowList>

        {/* What you've added for the next person. */}
        <RowList label="What you’ve added" id="added-h" className="mt-7">
          <Row icon="check-circle" tone="people" eyebrow={impact?.steward.steward ? "Mira Scout" : "Your impact"} title={impact ? (impact.summary.verified ? `${impact.summary.verified} confirmed by others` : impact.summary.pending ? `${impact.summary.pending} waiting for someone to agree` : "Nothing yet") : "…"} detail={impact?.line ?? "Only what several people agree on ever shows as a note"} href="/contribute" ariaLabel="Your impact" />
          <Row icon="contribute" tone="accent" title="Answer a Mira Check" detail="One tap about a place you passed" href="/contribute" />
          <Row icon="flag" tone="ink" title="Report something" detail="Privately, about a street or what happened" href="/report?from=me" />
        </RowList>

        {/* How Mira behaves for you. */}
        <div className="mt-7 space-y-7"><PersonalSections /></div>

        <Group id="help" label="Help Points Mira suggests" className="mt-7" note="Turn off any kind of place you’d rather not be pointed to — when you feel unsafe or along your routes.">
          <div className="flex flex-wrap gap-2 p-4">
            {EXCLUDABLE.map((c) => {
              const on = !exclude.includes(c);
              return <Chip key={c} role="switch" on={on} icon={HELP_ICON[c] ?? "pin"} onClick={async () => {
                const next = on ? [...exclude, c] : exclude.filter((x) => x !== c);
                setExclude(next);
                const r = await api("/api/me", { method: "PATCH", body: { helpExclude: next } });
                if (!r.ok) { setExclude(exclude); toast(r.message, "error"); }
              }}>{HELP_CLASSES[c].label}</Chip>;
            })}
          </div>
        </Group>

        {emergency}

        <div className="mt-7 space-y-7">
          <AccountSection durable={user.durable} google={user.google} emailHint={user.emailHint} emailAvailable={emailAlerts} googleAvailable={modes.auth === "google"} saved={saved} />
          <PushSection available={modes.push === "web_push"} />
          <Group id="app" label="App"><AppearancePicker /><InstallCard variant="row" /></Group>
          <Group id="privacy" label="Privacy and your data">
            <GroupRow icon="shield" title="How Mira handles your data" href="/privacy" />
            <GroupRow icon="arrow" title="Download my data" detail="Everything Mira keeps for you, as one file" onClick={() => { window.location.href = "/api/me/export"; }} end={<span />} />
            <GroupRow icon="sparkle" title="Clear my chat with Mira" detail="Movement-plan questions are never kept" onClick={async () => { const r = await api("/api/mira", { method: "DELETE" }); toast(r.ok ? "Mira’s chat history cleared" : r.message, r.ok ? "info" : "error"); }} end={<span />} />
            <GroupRow icon="signout" tone="ink" title="Sign out" detail={isDemo ? "This account has no email — signing out deletes it" : "On this device"} onClick={() => setSheet("signout")} end={<span />} />
            <GroupRow icon="trash" tone="warm" title="Delete my account" detail="Places, people, journeys and chat are erased" onClick={() => setSheet("delete")} end={<span />} />
          </Group>
        </div>
        <p className="mt-8 px-1 text-center text-[0.72rem] leading-relaxed text-ink-subtle">Mira keeps only what you see here. Nothing is shared with anyone unless you choose it, each time.</p>
      </div>

      <Sheet open={sheet === "place"} onClose={() => setSheet(null)} title="Save where you are now" labelledBy="place-sheet-title" footer={<button type="button" onClick={() => void addPlace()} disabled={busy === "place"} className="mira-primary w-full"><Icon name="locate" className="size-5" />{busy === "place" ? "Finding you…" : "Save my current spot"}</button>}>
        <p className="m-meta">Mira saves this spot by name. It never keeps a history of where you’ve been.</p>
        <div role="radiogroup" aria-label="Kind of place" className="mt-4 flex flex-wrap gap-2">
          {EMOJIS.map(([e, l]) => <Chip key={l} on={placeEmoji === e} onClick={() => { setPlaceEmoji(e); setPlaceLabel(l); }}><span aria-hidden>{e}</span>{l}</Chip>)}
        </div>
        <label htmlFor="place-label" className="mt-5 block text-sm font-semibold">Name</label>
        <input id="place-label" value={placeLabel} maxLength={40} onChange={(e) => setPlaceLabel(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 text-base outline-none focus:ring-2 focus:ring-accent" />
      </Sheet>
      <Sheet open={sheet === "signout"} onClose={() => setSheet(null)} title={isDemo ? "Sign out and delete?" : "Sign out?"} labelledBy="signout-sheet-title" footer={<div className="flex gap-2"><button type="button" onClick={() => setSheet(null)} className="min-h-12 flex-1 rounded-2xl bg-surface font-semibold ring-1 ring-line-strong">Cancel</button><button type="button" onClick={() => void leave("signout")} disabled={busy === "signout"} className="mira-primary flex-1">{isDemo ? "Sign out & delete" : "Sign out"}</button></div>}>
        <p className="text-ink-muted">{isDemo ? "This account has no email, so there’s no way back in after signing out — signing out deletes it: places, people, journeys and chat. Add your email under Your account to keep it." : "You can sign back in on this phone or another one."}</p>
      </Sheet>
      <Sheet open={sheet === "delete"} onClose={() => setSheet(null)} title="Delete your account?" labelledBy="delete-sheet-title" footer={<div className="flex gap-2"><button type="button" onClick={() => setSheet(null)} className="min-h-12 flex-1 rounded-2xl bg-surface font-semibold ring-1 ring-line-strong">Cancel</button><button type="button" onClick={() => void leave("delete")} disabled={busy === "delete"} className="mira-primary flex-1">Delete everything</button></div>}>
        <p className="text-ink-muted">Your places, people, journeys and chat are erased. This can’t be undone.</p>
      </Sheet>
    </div>
  );
}

/** A saved place: its own emoji in the tile, the address or "pinned", and a quiet remove. */
function PlaceRow({ place, busy, onRemove }: { place: SavedPlace; busy: boolean; onRemove: () => void }) {
  return (
    <li className="m-card flex items-center gap-3 p-3.5 pr-1.5">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-lg">{place.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{place.label}</span>
        <span className="block truncate text-[0.8125rem] text-ink-muted">{place.address ?? "Pinned on the map"}</span>
      </span>
      <RowAction icon="trash" label={`Remove ${place.label}`} disabled={busy} onClick={onRemove} />
    </li>
  );
}
