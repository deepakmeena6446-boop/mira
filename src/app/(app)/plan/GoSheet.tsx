"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { Sheet, StateNote } from "@/components/mira/Frame";
import { api } from "@/lib/api-client";
import { freshLocation, locationUsable } from "@/lib/location-store";
import { keepTripRoute } from "@/lib/trip-route";
import { tripStartExtras } from "@/lib/trip-start";
import { recordUsage } from "@/lib/usage-signal";
import { haptic } from "@/lib/haptics";
import { startLocalJourney } from "@/lib/local-check-in-store";
import { haversineMeters } from "@/domain/pilot";
import type { MovementIntent } from "@/domain/plan-contract";
import type { Contact } from "@/server/account/contacts";
import type { TripView } from "@/server/trips";

export type GoTarget = {
  intent: MovementIntent | null;
  mode: "walk" | "ride" | "transit";
  loop: boolean;
  /** Where the journey ends (null for a run/loop: then it's "sharing where I am" for a set time). */
  to: { name: string; lat: number; lon: number; savedPlaceId?: string } | null;
  /** The plan's start, to warn when she isn't there. */
  start: { lat: number; lon: number } | null;
  minutes: number | null;
  geometry: Array<[number, number]> | null;
  fastest: boolean;
};

const names = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * The consent moment. Nothing starts, and nobody is contacted, until "Start". "Just me" is the default.
 * Signed out: a private check-in on this device (no GPS, nobody contacted) — or sign in for a live journey.
 */
export function GoSheet({ open, onClose, target, signedIn, emailAlerts, onSignIn }: { open: boolean; onClose: () => void; target: GoTarget; signedIn: boolean; emailAlerts: boolean; onSignIn: () => void }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [eta, setEta] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const farConfirmed = useRef(false);

  useEffect(() => {
    if (!open || !signedIn || contacts) return;
    let live = true;
    void api<{ contacts: Contact[] }>("/api/me/contacts").then((r) => { if (!live) return; if (r.ok) setContacts(r.data.contacts); else setFailed(true); });
    return () => { live = false; };
  }, [open, signedIn, contacts]);
  // A provider time gets a little slack; a walk's ETA is computed by the server from the route.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-derive the default when the chosen option changes
    if (target.minutes) setEta(Math.min(235, Math.max(5, Math.ceil(target.minutes * (target.loop ? 1 : 1.25)) + 5)));
  }, [target.minutes, target.loop]);

  const eligible = (contacts ?? []).filter((c) => c.status === "accepted" || c.phone);
  const chosen = eligible.filter((c) => picked.includes(c.id));
  const whatsapp = chosen.filter((c) => c.phone).map((c) => c.name);
  const emailed = emailAlerts ? chosen.filter((c) => c.status === "accepted").map((c) => c.name) : [];

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const fix = await freshLocation();
    if (!locationUsable(fix) || !fix.point) { setBusy(false); return setMessage(fix.status === "denied" ? "Location is off for Mira. A live journey needs your position while the screen is open." : "A fresh, accurate position isn’t available yet. Step outside or wait a moment, then try again."); }
    const from = { lat: fix.point.lat, lon: fix.point.lon };
    // A named start elsewhere is never replaced silently: say so once, then follow from here if she confirms.
    if (target.start && haversineMeters(from, target.start) > 300 && !farConfirmed.current) {
      farConfirmed.current = true;
      setBusy(false);
      return setMessage(`You’re about ${(haversineMeters(from, target.start) / 1000).toFixed(1)} km from this plan’s start. A live journey follows you from where you are now. Tap Start again to go from here.`);
    }
    key.current ??= crypto.randomUUID();
    const body = target.to && !target.loop
      ? { from, to: { lat: target.to.lat, lon: target.to.lon, name: target.to.name.slice(0, 80) }, share: picked.length > 0, recipientIds: picked, idempotencyKey: key.current, ...(target.mode === "walk" ? (!target.fastest && target.minutes ? { routeMinutes: Math.max(1, Math.min(240, Math.round(target.minutes))) } : {}) : { mode: target.mode, etaMinutes: eta }), ...tripStartExtras(target.to.savedPlaceId) }
      : { from, share: picked.length > 0, recipientIds: picked, idempotencyKey: key.current, mode: "other", etaMinutes: eta, ...tripStartExtras() };
    const r = await api<{ trip: TripView }>("/api/trips", { body });
    setBusy(false);
    if (r.ok) {
      recordUsage("journey");
      haptic("journey-start");
      if (target.geometry && target.geometry.length > 2) keepTripRoute(r.data.trip.id, target.geometry);
      router.push("/trip");
      router.refresh();
    } else if (r.code === "trip_active") {
      router.push("/trip");
    } else {
      key.current = null;
      setMessage(r.message);
    }
  };

  const startPrivate = () => {
    if (!target.intent) return setMessage("Complete the places and time first.");
    if (startLocalJourney(target.intent, null, eta)) router.push("/trip/local");
    else setMessage("Couldn’t start a private check-in on this device.");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Go with Mira" labelledBy="go-sheet-title" footer={
      signedIn ? (
        <button type="button" onClick={() => void start()} disabled={busy} className="mira-primary w-full">{busy ? "Starting…" : picked.length ? `Start and share with ${names(chosen.map((c) => c.name))}` : "Start — just me"}</button>
      ) : (
        <div className="grid gap-2">
          <button type="button" onClick={onSignIn} className="mira-primary w-full">Sign in for a live journey</button>
          <button type="button" onClick={startPrivate} className="min-h-12 w-full rounded-2xl font-semibold text-accent-strong ring-1 ring-line-strong">Start a private check-in instead</button>
        </div>
      )
    }>
      <div className="space-y-5 pb-2">
        <section aria-labelledby="go-who">
          <h3 id="go-who" className="font-semibold">Who can follow?</h3>
          {!signedIn ? (
            <p className="mt-1 text-sm text-ink-muted">Signed out, this stays on your phone: a private check-in timer, no location, nobody contacted. Sign in to share a live link with people you choose.</p>
          ) : failed ? (
            <StateNote className="mt-2" title="Couldn’t load your Circle">You can still start just for you, and send your live link after starting.</StateNote>
          ) : !contacts ? (
            <p role="status" className="mt-2 text-sm text-ink-muted">Loading your Circle…</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Choose who follows this journey">
              <button type="button" aria-pressed={!picked.length} onClick={() => setPicked([])} className={cx("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1", !picked.length ? "bg-ink text-canvas ring-ink" : "bg-surface ring-line-strong")}>
                <Icon name="user" className="size-4" /> Just me
              </button>
              {eligible.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => setPicked((xs) => (on ? xs.filter((x) => x !== c.id) : [...xs, c.id]))} className={cx("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1", on ? "bg-accent text-accent-ink ring-accent" : "bg-surface ring-line-strong")}>
                    {on ? <Icon name="check" className="size-4" /> : null}{c.name}
                  </button>
                );
              })}
              {!eligible.length ? <p className="w-full text-sm text-ink-muted">Nobody in your Circle yet. You can still send your live link to anyone after you start.</p> : null}
            </div>
          )}
          {signedIn && contacts ? (
            <p className="mt-2 text-sm text-ink-muted">
              {!picked.length
                ? "Nobody is contacted. After you start, you can send your live link yourself."
                : [whatsapp.length ? `After you start, you send ${names(whatsapp)} the link on WhatsApp (you press Send).` : null, emailed.length ? `Mira attempts to email ${names(emailed)} a live link now, and an alert if you don’t check in. Sending can fail.` : "Nobody is alerted automatically if you don’t check in."].filter(Boolean).join(" ")}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="go-when">
          <h3 id="go-when" className="font-semibold">{target.loop || !target.to ? "Check in after" : target.mode === "walk" ? "Check-in time" : "When do you expect to arrive?"}</h3>
          {target.mode === "walk" && target.to && !target.loop ? (
            <p className="mt-1 text-sm text-ink-muted">Mira sets your check-in from the route time{target.minutes ? ` (about ${Math.round(target.minutes)} min)` : ""} plus a little spare. You can add 10 minutes on the way.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button key={m} type="button" aria-pressed={eta === m} onClick={() => setEta(m)} className={cx("min-h-11 rounded-full px-4 text-sm font-semibold ring-1", eta === m ? "bg-accent text-accent-ink ring-accent" : "bg-surface ring-line-strong")}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>
              ))}
              {![15, 30, 45, 60, 90, 120].includes(eta) ? <span className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">{eta} min</span> : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-sunken p-3 text-sm text-ink-muted">
          <p><strong className="text-ink">While you go:</strong> your position updates while the journey screen is open. Phones may pause it when locked. Tap “I’m here” when you arrive.</p>
        </section>
        {message ? <StateNote tone="attention" role="alert">{message}</StateNote> : null}
      </div>
    </Sheet>
  );
}
