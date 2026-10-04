"use client";

import type { Contact } from "@/server/account/contacts";

/** Choosing a contact here proposes a recipient; no request or alert is sent. */
export function RecipientPicker({ contacts, selectedIds, onChange, disabled = false, alreadyFollowing = 0 }: { contacts: Contact[]; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean; alreadyFollowing?: number }) {
  const eligible = contacts.filter((contact) => contact.status === "accepted" || contact.phone);
  // With people already on the journey, "stays private" would be false (audit P01-003).
  if (!eligible.length) return <p className="text-sm text-ink-muted">{alreadyFollowing ? "Everyone in your Circle who can follow is already on this journey." : "No accepted email or WhatsApp contacts available. This journey stays private."}</p>;
  return <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-line p-3">
    <legend className="px-1 text-sm font-semibold">Choose who follows this journey</legend>
    <p className="text-xs text-ink-muted">Unchecked contacts receive nothing. Email attempts can fail; WhatsApp still needs you to press Send.</p>
    {eligible.map((contact) => <label key={contact.id} className="flex min-h-12 items-center gap-3 text-sm">
      <input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={(event) => onChange(event.target.checked ? [...selectedIds, contact.id] : selectedIds.filter((id) => id !== contact.id))} className="size-5 accent-[var(--color-accent)]" />
      <span>{contact.name}<span className="block text-xs text-ink-muted">{[contact.status === "accepted" ? "Email attempt" : null, contact.phone ? "Send yourself on WhatsApp" : null].filter(Boolean).join(" · ")}</span></span>
    </label>)}
  </fieldset>;
}
