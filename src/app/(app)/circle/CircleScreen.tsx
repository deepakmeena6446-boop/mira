"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/app/Avatar";
import { MiraOrb } from "@/components/app/MiraOrb";
import { SignInSheet } from "@/components/app/SignInSheet";
import { Section } from "@/components/app/Section";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { MAX_CONTACTS } from "@/domain/limits";
import type { Contact } from "@/server/account/contacts";
import { useCountry } from "@/lib/locale-store";

/**
 * Circle: the people who follow her journeys. Who they are and exactly how they're reached:
 * WhatsApp (she sends her live link in one tap — Mira opens WhatsApp, it doesn't send), and
 * optionally email (Mira invites them and can attempt the automatic missed-arrival alert). So
 * nobody believes someone will be alerted who won't.
 */
export function CircleScreen({ user, contacts: initialContacts, emailAlerts }: { user: { name: string } | null; contacts: Contact[]; emailAlerts: boolean }) {
  const toast = useToast();
  const [contacts, setContacts] = useState(initialContacts);
  const [addingContact, setAddingContact] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const country = useCountry();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null); // contact id awaiting "Remove?"
  const [removing, setRemoving] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);

  if (!user) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-[calc(var(--tabbar-space)+2rem)] text-center">
        <MiraOrb size={80} />
        <h1 className="mt-6 text-3xl font-semibold">Your circle</h1>
        <p className="mt-2 max-w-sm text-ink-muted">Save the people who should know you got there. When you start a journey, you send them your live link on WhatsApp in one tap. Contact email depends on availability and their acceptance.</p>
        <Button className="mt-7 max-w-xs" variant="hero" size="lg" onClick={() => setSignIn(true)}>
          Get started
        </Button>
        <SignInSheet open={signIn} onClose={() => setSignIn(false)} />
      </div>
    );
  }

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("contact");
    const body = { name: cName.trim(), ...(cPhone.trim() ? { phone: cPhone.trim(), ...(country.iso ? { country: country.iso } : {}) } : {}), ...(cEmail.trim() ? { email: cEmail.trim() } : {}) };
    const r = await api<{ contact: Contact }>("/api/me/contacts", { body });
    setBusy(null);
    if (r.ok) {
      const c = r.data.contact;
      setContacts((xs) => [...xs, c]);
      setCName("");
      setCEmail("");
      setCPhone("");
      setAddingContact(false);
      if (c.status === "phone") toast(`${c.name} saved — you'll send them your live link on WhatsApp`);
      else toast(c.status === "invited" ? `Invite sent to ${c.name}` : "Saved — but the invite email couldn't be sent", c.status === "invited" ? "info" : "error");
    } else toast(r.message, "error");
  };
  const accepted = contacts.filter((c) => c.status === "accepted");
  const onWhatsApp = contacts.filter((c) => c.phone);
  const list = (xs: Contact[]) => (xs.length <= 2 ? xs.map((c) => c.name).join(" and ") : `${xs.slice(0, -1).map((c) => c.name).join(", ")} and ${xs[xs.length - 1].name}`);

  return (
    <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="pt-2 animate-rise">
          <h1 className="text-2xl font-semibold">Your circle</h1>
          {onWhatsApp.length ? (
            <p className="mt-1 text-ink-muted">
              <span className="font-semibold text-ink">{list(onWhatsApp)}</span> {onWhatsApp.length === 1 ? "is" : "are"} one tap away on WhatsApp: when you start a journey, send them your live link from the journey screen. Mira opens WhatsApp; you press Send.
            </p>
          ) : null}
          <p className="mt-1 text-ink-muted">
            {accepted.length && emailAlerts
              ? `${accepted.map((c) => c.name).join(", ")} ${accepted.length === 1 ? "is" : "are"} eligible for a live-link email when you share a journey and a missed-check-in email. Mira shows sending results on the journey screen.`
              : emailAlerts ? "Automatic email needs an accepted trusted contact on the journey: add their email too, and they'll get an invite." : "Contact email is unavailable right now, so nobody is emailed automatically."}
          </p>
        </header>

        <Section
          id="contacts"
          title="Trusted contacts"
          action={
            contacts.length >= MAX_CONTACTS && !addingContact ? (
              <span className="text-sm font-semibold text-ink-subtle">
                {MAX_CONTACTS} of {MAX_CONTACTS}
              </span>
            ) : (
              <button type="button" onClick={() => setAddingContact((v) => !v)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-accent-strong">
                {addingContact ? "Cancel" : "+ Add"}
              </button>
            )
          }
        >
          {!emailAlerts ? (
            <p role="status" className="border-b border-line bg-warm-soft px-5 py-3 text-sm text-ink">
              Email alerts aren&apos;t switched on in this version yet, so contacts can&apos;t be emailed. Add their WhatsApp number to send your live link in one tap.
            </p>
          ) : null}
          {addingContact ? (
            <form onSubmit={addContact} className="border-b border-line p-5">
              <label className="block text-sm font-semibold" htmlFor="c-name">
                Name
              </label>
              <input id="c-name" required value={cName} maxLength={60} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Mum" className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-sunken px-4 outline-none focus:border-accent" />
              <label className="mt-3 block text-sm font-semibold" htmlFor="c-phone">
                WhatsApp number
              </label>
              <input id="c-phone" type="tel" inputMode="tel" autoComplete="tel" value={cPhone} maxLength={32} onChange={(e) => setCPhone(e.target.value)} placeholder={country.callingCode ? `${country.callingCode} 98765 43210` : "+91 98765 43210"} className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-sunken px-4 outline-none focus:border-accent" />
              <p className="mt-1 text-sm text-ink-muted">When you start a journey, Mira opens WhatsApp with your live link ready for them — you press Send.</p>
              <label className="mt-3 block text-sm font-semibold" htmlFor="c-email">
                Email <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="c-email" type="email" inputMode="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-sunken px-4 outline-none focus:border-accent" />
              <p className="mt-1 text-sm text-ink-muted">For an automatic alert if you don&apos;t arrive. Mira attempts an email invite when email is available. After they accept, journey and missed-check-in emails can be attempted; sending can fail.</p>
              <Button type="submit" className="mt-4" variant="primary" size="lg" busy={busy === "contact"} busyLabel="Saving…" disabled={!cName.trim() || (!cPhone.trim() && !cEmail.trim())}>
                {cEmail.trim() ? "Save and send invite" : "Save"}
              </Button>
            </form>
          ) : null}
          {contacts.length === 0 && !addingContact ? (
            <p className="p-5 text-ink-muted">Add someone you trust — a WhatsApp number is enough. Accepted email contacts on a journey can also receive live-link and missed-check-in emails when email is available.</p>
          ) : (
            <ul className="divide-y divide-line">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={c.name} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-ink-muted">{[c.phoneHint ? `WhatsApp ${c.phoneHint}` : null, c.emailHint].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span
                    className={cx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      c.status === "accepted" || c.status === "phone" ? "bg-mint-soft text-mint" : c.status === "invited" ? "bg-sunken text-ink-muted" : "bg-error-soft text-error",
                    )}
                  >
                    {c.status === "accepted" ? "Trusted" : c.status === "phone" ? "WhatsApp" : c.status === "invited" ? "Invited" : "Invite failed"}
                  </span>
                  {confirmRemove === c.id ? (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={removing === c.id}
                        onClick={async () => {
                          setRemoving(c.id);
                          const r = await api(`/api/me/contacts/${c.id}`, { method: "DELETE" });
                          setRemoving(null);
                          setConfirmRemove(null);
                          if (r.ok) {
                            setContacts((xs) => xs.filter((x) => x.id !== c.id));
                            toast(`${c.name} removed — any live link they had stops working now.`);
                          } else toast(r.message, "error");
                        }}
                        className="min-h-11 rounded-full bg-ink px-3 text-sm font-semibold text-canvas disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button type="button" onClick={() => setConfirmRemove(null)} className="min-h-11 rounded-full px-2 text-sm font-semibold text-ink-muted">
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => setConfirmRemove(c.id)}
                      className="grid size-11 place-items-center rounded-full text-ink-subtle hover:bg-sunken"
                    >
                      <Icon name="trash" className="size-5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <p className="px-1 text-sm text-ink-muted">
          On a journey, <strong>Tell my people now</strong> (in &ldquo;I feel unsafe&rdquo;) opens WhatsApp for each contact with a number, asking them to check on you, and {emailAlerts ? "attempts to email accepted contacts who are available for that journey with a live link. The screen shows which attempts the provider accepted or rejected." : "cannot email contacts while contact email is unavailable."} Mira never contacts anyone else.{" "}
          <Link href="/privacy" className="font-semibold text-accent-strong">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
