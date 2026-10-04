"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MovementIntent } from "@/domain/plan-contract";
import { instantForLocal, localTimeForInstant, planOptionsKey, type PlanOption } from "@/domain/plan-options";
import { resolvedDestination, resolvedOrigin } from "@/domain/plan-state";
import { api } from "@/lib/api-client";
import { requestLocation, locationUsable } from "@/lib/location-store";
import { haversineMeters } from "@/domain/pilot";
import { readLocalCheckIn, startLocalJourney, updateLocalJourney, useLocalJourneyActive } from "@/lib/local-check-in-store";
import type { LocalCheckIn } from "@/domain/local-check-in";
import { keepTripRoute } from "@/lib/trip-route";
import { activeTripMessage } from "@/lib/trip-start";
import { currentPlanDraft, setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import type { Contact } from "@/server/account/contacts";
import type { TripView } from "@/server/trips";
import { RecipientPicker } from "./RecipientPicker";
import { RoutePreview } from "./RoutePreview";

export function PlanJourneyControls({ plan, option, signedIn, emailAlerts }: { plan: MovementIntent; option: PlanOption | null; signedIn: boolean; emailAlerts: boolean }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const draft = usePlanDraft();
  const activeManual = useLocalJourneyActive();
  const [fallbackRecipients, setFallbackRecipients] = useState<string[]>([]);
  const [fallbackAssisted, setFallbackAssisted] = useState(false);
  const recipientIds = draft?.recipientIds ?? fallbackRecipients;
  const assisted = !activeManual && signedIn && (draft?.journeyMode ? draft.journeyMode === "location" : fallbackAssisted);
  const setRecipientIds = (ids: string[]) => { setFallbackRecipients(ids); const current = currentPlanDraft(); if (current) setPlanDraft({ ...current, recipientIds: ids }); };
  const setAssisted = (value: boolean) => { setFallbackAssisted(value); const current = currentPlanDraft(); if (current) setPlanDraft({ ...current, journeyMode: value ? "location" : "manual" }); };
  const [minutes, setMinutes] = useState(30);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [otherTrip, setOtherTrip] = useState(false);
  const [manualPlaceConfirmation, setManualPlaceConfirmation] = useState<string | null>(null);
  const [continuedOriginConfirmation, setContinuedOriginConfirmation] = useState<string | null>(null);
  const reviewedTimer = useRef<LocalCheckIn | null>(null);
  const requestKey = useRef<string | null>(null);
  const sentStart = useRef<{ key: string; at: number; body: Record<string, unknown> } | null>(null);
  const key = `${planOptionsKey(plan) || JSON.stringify(plan)}|${option?.id ?? "manual"}|${minutes}|${assisted}|${recipientIds.join(",")}|${activeManual}`;
  useEffect(() => { if (!signedIn || activeManual) return; let live = true; void api<{ contacts: Contact[] }>("/api/me/contacts").then((r) => { if (live && r.ok) setContacts(r.data.contacts); }); return () => { live = false; }; }, [signedIn, activeManual]);
  const eta = option && plan.mode === "walk" && !activeManual ? Math.max(5, Math.ceil(option.minutes)) : minutes;
  const arrival = plan.timeKind === "arrive_by" ? instantForLocal(plan.departure.local, plan.departure.timeZone) : null;
  const manualDeparture = !option && arrival && Number.isInteger(eta) && eta >= 5 && eta <= 235 ? new Date(arrival.getTime() - eta * 60_000) : null;
  const depart = option?.departureLocal ?? (plan.timeKind === "arrive_by" ? manualDeparture ? localTimeForInstant(manualDeparture, plan.departure.timeZone) : null : plan.departure.local);
  const unresolvedPlaces = !resolvedOrigin(plan) || (!plan.loop && !resolvedDestination(plan));
  const start = async () => {
    if (busy || confirm !== key) return;
    const from = resolvedOrigin(plan); const target = resolvedDestination(plan);
    const planned = manualDeparture ?? (depart ? instantForLocal(depart, plan.departure.timeZone) : null);
    if (!planned || (!activeManual && Math.abs(planned.getTime() - Date.now()) > 30 * 60_000)) return setMessage("This plan is for another time, or departure is unknown. Review the local departure before starting now.");
    if (!Number.isInteger(eta) || eta < 5 || eta > 235) return setMessage("Choose a check-in interval between 5 and 235 minutes.");
    if (!assisted) {
      if (unresolvedPlaces && manualPlaceConfirmation !== key) return setMessage("Confirm the named places directly first — Mira hasn’t found them on a map or checked a route.");
      if (activeManual) {
        if (continuedOriginConfirmation !== key) return setMessage("Manually confirm the origin for your continued journey before updating. Mira has not checked where you are.");
        if (!reviewedTimer.current || !updateLocalJourney(plan, option, eta, reviewedTimer.current)) return setMessage("The reviewed journey changed or expired, or this remaining interval exceeds 235 minutes from its original start. Review again with a shorter interval.");
        setAssisted(false); setRecipientIds([]); router.push("/trip/local");
      } else if (reviewedTimer.current) setMessage("The reviewed private journey is no longer active. Review a fresh start separately.");
      else if (startLocalJourney(plan, option, eta)) router.push("/trip/local");
      else setMessage("Review your active manual journey before updating it.");
      return;
    }
    if (!from || (!plan.loop && !target)) return setMessage("Pick your places from the search results to share your location — or start a private journey instead.");
    if (!signedIn) return setMessage("Sign in under You to share your location, or start a private journey without an account.");
    setBusy(true); setMessage(null); setOtherTrip(false);
    if (requestKey.current && sentStart.current?.key === requestKey.current && Date.now() - sentStart.current.at > 30_000) { const receipt = await api<{ trip: TripView | null }>("/api/trips/current"); setBusy(false); if (receipt.ok && receipt.data.trip) { router.push("/trip"); return; } if (!receipt.ok) return setMessage("The previous start is unconfirmed. Reconnect to check it before starting again."); requestKey.current = null; setConfirm(null); return setMessage("The previous start expired without an active journey. Review and confirm a fresh start."); }
    const fix = await requestLocation();
    if (!locationUsable(fix, { maxAgeMs: 30_000 }) || !fix.point || haversineMeters(from, fix.point) > Math.max(150, fix.point.accuracy * 2)) { setBusy(false); return setMessage("Mira needs a fresh, accurate location near your start. Try again, or start a private journey."); }
    if (option && plan.mode === "walk" && option.originAccessMeters !== undefined && option.originAccessMeters > 250) { setBusy(false); return setMessage("The mapped route does not connect closely enough to the chosen origin. Review access or choose manual mode."); }
    if (option && target && !plan.loop && plan.mode === "walk") { const last = option.geometry.at(-1); if (!last || haversineMeters(target, { lon: last[0], lat: last[1] }) > 250) { setBusy(false); return setMessage("Destination access is not established by the mapped route. Review access or choose manual mode."); } }
    if (recipientIds.some((id) => !contacts.some((contact) => contact.id === id && (contact.status === "accepted" || contact.phone)))) { setBusy(false); return setMessage("A selected contact is no longer available. Review your recipient choices."); }
    requestKey.current ??= crypto.randomUUID();
    if (sentStart.current?.key !== requestKey.current) sentStart.current = { key: requestKey.current, at: Date.now(), body: { from: { lat: fix.point.lat, lon: fix.point.lon }, ...(target && !plan.loop ? { to: { ...target, name: target.name.slice(0, 80) } } : {}), mode: plan.mode, etaMinutes: eta, ...(option && plan.mode === "walk" ? { routeMinutes: Math.ceil(option.minutes) } : {}), tz: plan.departure.timeZone, recipientIds, share: recipientIds.length > 0, idempotencyKey: requestKey.current } };
    const result = await api<{ trip: TripView }>("/api/trips", { body: sentStart.current.body });
    setBusy(false);
    if (result.ok) { if (option?.geometry.length) keepTripRoute(result.data.trip.id, option.geometry); router.push("/trip"); router.refresh(); }
    else if (result.code === "trip_active") { requestKey.current = null; setConfirm(null); setOtherTrip(true); setMessage(await activeTripMessage()); }
    else setMessage(result.message);
  };
  return <section className="space-y-4 rounded-3xl border border-line bg-surface p-5" aria-label={activeManual ? "Update private journey" : "Start chosen plan"}>
    {option ? <RoutePreview option={option} /> : null}
    <div className="flex flex-wrap gap-3"><Link href="/around/map" className="min-h-12 py-3 text-sm font-semibold text-accent-strong">Explore map</Link>{plan.destination ? <a href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(plan.origin.kind === "named" ? plan.origin.query : "Current location")}&destination=${encodeURIComponent(plan.destination.query)}&travelmode=${plan.mode === "walk" ? "walking" : plan.mode === "ride" ? "driving" : "transit"}`} target="_blank" rel="noopener noreferrer" className="min-h-12 py-3 text-sm font-semibold text-accent-strong">Open navigation provider ↗</a> : null}</div>
    {plan.mode !== "walk" ? <p className="text-sm text-ink-muted">This opens your places in your maps app. It doesn’t book anything — check pickup and hours there.</p> : null}
    <fieldset className="space-y-2"><legend className="font-semibold">How would you like to move?</legend><label className="flex min-h-12 gap-3 items-center"><input type="radio" name="journey-kind" checked={!assisted} onChange={() => { setAssisted(false); setRecipientIds([]); setConfirm(null); requestKey.current = null; }} />Private, on this phone</label><p className="text-xs text-ink-muted">You check in yourself. No location is used, and nobody is alerted.</p>{signedIn ? <label className="flex min-h-12 gap-3 items-center"><input type="radio" name="journey-kind" checked={assisted} disabled={activeManual} onChange={() => { setAssisted(true); setConfirm(null); requestKey.current = null; }} />Share my location while Mira is open</label> : !activeManual ? <Link href="/me" className="inline-flex min-h-12 items-center text-sm text-accent-strong">Sign in to share your location</Link> : null}{activeManual ? <p className="text-xs text-ink-muted">This updates your private journey; its start time and 235-minute limit stay. End it first to share your location instead.</p> : null}</fieldset>
    {!option || plan.mode !== "walk" || activeManual ? <label className="block text-sm font-semibold">{activeManual ? "Remaining check-in (minutes)" : "Check in after (minutes)"}<input type="number" min={5} max={235} value={minutes} onChange={(e) => { setMinutes(Number(e.target.value)); setConfirm(null); requestKey.current = null; }} className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-canvas px-3" /></label> : <p className="text-sm">Estimated {eta} minutes · {plan.departure.timeZone}</p>}
    {plan.timeKind === "arrive_by" && !option && depart ? <p className="text-sm text-ink-muted">To arrive by {plan.departure.local.replace("T", " ")}: with your {eta}-minute estimate, depart about {depart.replace("T", " ")} ({plan.departure.timeZone}).</p> : null}
    {!assisted && unresolvedPlaces ? <label className="flex min-h-12 items-start gap-3 text-sm"><input type="checkbox" checked={manualPlaceConfirmation === key} onChange={(e) => { setManualPlaceConfirmation(e.target.checked ? key : null); setConfirm(null); }} className="mt-1 size-5 shrink-0" />I confirmed the named places directly. Mira hasn’t found them on a map or checked a route.</label> : null}
    {activeManual ? <><p className="text-sm text-ink-muted">Review your continued origin and the planning time above. Options use that entered time; your remaining check-in estimate starts when you confirm.</p><label className="flex min-h-12 items-start gap-3 text-sm"><input type="checkbox" checked={continuedOriginConfirmation === key} onChange={(e) => { setContinuedOriginConfirmation(e.target.checked ? key : null); setConfirm(null); }} className="mt-1 size-5 shrink-0" />I manually confirmed the origin for my continued journey: {plan.origin.kind === "named" ? plan.origin.query : "the previously chosen point"}. Mira has not checked where I am.</label></> : null}
    {assisted ? <><RecipientPicker contacts={contacts} selectedIds={recipientIds} onChange={(ids) => { setRecipientIds(ids); setConfirm(null); requestKey.current = null; }} /><p className="text-xs text-ink-muted">{emailAlerts ? "Mira will try to email the people you pick. On WhatsApp, you press send." : "Mira can’t send email right now — send your link yourself."}</p></> : null}
    {confirm === key ? <div className="rounded-2xl bg-accent-soft p-4"><p className="text-sm">{activeManual ? `Update the same private journey to ${option?.label ?? "this reviewed manual plan"}, with check-in ${eta} minutes from confirmation? Manual progress resets; the original start stays unchanged.` : `Start ${option?.label ?? "this manual plan"} now?`} {assisted ? `Mira uses your location while it’s open. ${recipientIds.length ? `Sharing with ${contacts.filter((c) => recipientIds.includes(c.id)).map((c) => c.name).join(", ")}.` : "Nobody is notified."}` : "Only you can see this journey. It can’t alert anyone or tell when you arrive."}</p><div className="mt-3 flex gap-3"><button type="button" disabled={busy} onClick={() => void start()} className="mira-primary">{busy ? "Checking location…" : activeManual ? "Confirm journey update" : "Confirm start"}</button><button type="button" disabled={busy} onClick={() => { setConfirm(null); requestKey.current = null; reviewedTimer.current = null; }} className="min-h-12 px-3">Cancel</button></div></div> : <button type="button" onClick={() => { setMessage(null); requestKey.current = null; reviewedTimer.current = readLocalCheckIn(); setConfirm(key); }} className="mira-primary w-full">{activeManual ? "Review journey update" : option ? "Start chosen journey" : "Start manual journey"}</button>}
    {message ? <p role="status" className="text-sm text-error">{message}</p> : null}
    {otherTrip ? <Link href="/trip" className="inline-flex min-h-12 items-center text-sm font-semibold text-accent-strong">Open my current journey</Link> : null}
  </section>;
}
