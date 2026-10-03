"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useLocation, useClock, usableLocationPoint, requestLocation, locationUsable, currentLocation, setArea, setPendingDestination } from "@/lib/location-store";
import { setCountry, useCountry, type CountryContext } from "@/lib/locale-store";
import { closeOverlayThen, useOverlay } from "@/lib/use-overlay";
import { HelpCluster } from "./HelpCluster";
import { UnsafeSheet, type UnsafeShareAction, type UnsafeTellAction } from "./UnsafeSheet";
import { RecipientPicker } from "./RecipientPicker";
import type { Contact } from "@/server/account/contacts";
import type { TripView } from "@/server/trips";
import { HELP_CLASSES, type HelpClass, type HelpPoint } from "@/domain/help-points";
import type { EvidenceState } from "@/domain/evidence-state";

/** Immediate support uses current position only; starting/sharing always gets its own named review. */
export function SafetyAccess({ emailAlerts, className = "", compact = false }: { emailAlerts: boolean; className?: string; compact?: boolean }) {
  const router = useRouter(); const loc = useLocation(false); const clock = useClock(); const country = useCountry();
  const me = usableLocationPoint(loc, clock?.getTime());
  const areaKey = me ? `${me.lat.toFixed(3)},${me.lon.toFixed(3)}|${Math.floor(loc.at / 60_000)}` : "";
  const key = `${areaKey}|${country.iso}`;
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const sentStart = useRef<{ key: string; at: number; body: Record<string, unknown> } | null>(null);
  const [account, setAccount] = useState<{ signedIn: boolean; contacts: Contact[]; exclude: HelpClass[]; trip: TripView | null; loading: boolean }>({ signedIn: false, contacts: [], exclude: [], trip: null, loading: true });
  const [help, setHelp] = useState<{ key: string; points: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> | null; failed: boolean } | null>(null);
  useOverlay(sharing, () => setSharing(false));
  useEffect(() => { const show = () => setOpen(true); window.addEventListener("mira:need-options", show); return () => window.removeEventListener("mira:need-options", show); }, []);
  useEffect(() => {
    if (!open && !sharing) return;
    let live = true;
    void Promise.all([api<{ user: { helpExclude?: string[] } | null; contacts?: Contact[] }>("/api/me"), api<{ contacts: Contact[] }>("/api/me/contacts"), api<{ trip: TripView | null }>("/api/trips/current")]).then(([who, people, current]) => {
      if (!live) return;
      setAccount({ signedIn: Boolean(who.ok && who.data.user), contacts: people.ok ? people.data.contacts : [], exclude: who.ok ? (who.data.user?.helpExclude ?? []).filter((x): x is HelpClass => x in HELP_CLASSES) : [], trip: current.ok ? current.data.trip : null, loading: false });
    });
    return () => { live = false; };
  }, [open, sharing]);
  useEffect(() => {
    if (!me) return;
    let live = true; const fixAt = loc.at; const point = { lat: me.lat, lon: me.lon };
    void api<{ label: string | null; country: CountryContext }>("/api/geo/reverse", { body: point }).then((r) => {
      const current = currentLocation();
      if (!live || !r.ok || !locationUsable(current) || current.at < fixAt || !current.point || Math.abs(current.point.lat - point.lat) > 0.001 || Math.abs(current.point.lon - point.lon) > 0.001) return;
      setCountry(r.data.country, { point, checkedAt: fixAt }); setArea(r.data.label);
    });
    return () => { live = false; };
    // Rounded cell plus acquisition minute prevents jitter fetches while refreshing stationary context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey]);
  useEffect(() => {
    if (!me || !open) return;
    let live = true;
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { lat: me.lat, lon: me.lon, country: country.iso } }).then((r) => { if (live) setHelp({ key, points: r.ok ? r.data.helpPoints : [], evidence: r.ok ? r.data.evidence : null, failed: !r.ok || r.data.evidence?.state === "failed" }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open]);
  const activeTrip = account.trip && (account.trip.state === "active" || account.trip.state === "missed") ? account.trip : null;
  const share: UnsafeShareAction = { label: activeTrip ? "Manage journey sharing" : "Share where I am live", detail: "Review named recipients first. Nobody is contacted by opening this action.", onShare: () => { requestKey.current = null; setRecipientIds([]); setMessage(null); closeOverlayThen(() => setOpen(false), () => setSharing(true)); } };
  const leaveSharing = (refresh = false) => closeOverlayThen(() => setSharing(false), () => { router.push("/trip"); if (refresh) router.refresh(); });
  const tell: UnsafeTellAction | null = activeTrip?.sharedWith.length ? { names: activeTrip.sharedWith.map((c) => c.name), email: emailAlerts && activeTrip.sharedWith.some((c) => c.viaEmail), onTell: async () => { const r = await api<{ told: string[]; failed: string[]; whatsapp: Array<{ name: string; url: string }> }>(`/api/trips/${activeTrip.id}/checkon`, { body: {} }); return r.ok ? r.data : { error: r.message }; } } : null;
  const confirmShare = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    if (activeTrip) { const r = await api<{ trip: TripView }>(`/api/trips/${activeTrip.id}/share`, { body: { recipientIds } }); setBusy(false); if (r.ok) leaveSharing(true); else setMessage(r.message); return; }
    if (requestKey.current && sentStart.current?.key === requestKey.current && Date.now() - sentStart.current.at > 30_000) { const receipt = await api<{ trip: TripView | null }>("/api/trips/current"); setBusy(false); if (receipt.ok && receipt.data.trip) { leaveSharing(); return; } if (!receipt.ok) return setMessage("The previous start is unconfirmed. Reconnect before starting again."); requestKey.current = null; return setMessage("The previous start expired without an active journey. Confirm a fresh start when ready."); }
    const fix = await requestLocation();
    if (!locationUsable(fix, { maxAgeMs: 30_000 }) || !fix.point) { setBusy(false); return setMessage("A fresh, accurate position is unavailable. Calling and Emergency remain available."); }
    requestKey.current ??= crypto.randomUUID();
    if (sentStart.current?.key !== requestKey.current) sentStart.current = { key: requestKey.current, at: Date.now(), body: { from: { lat: fix.point.lat, lon: fix.point.lon }, share: recipientIds.length > 0, recipientIds, etaMinutes: 30, idempotencyKey: requestKey.current } };
    const r = await api<{ trip: TripView }>("/api/trips", { body: sentStart.current.body });
    setBusy(false); if (r.ok || r.code === "trip_active") leaveSharing(true); else setMessage(r.message);
  };
  return <>
    <div className={className}><HelpCluster compact={compact} onUnsafe={() => setOpen(true)} /></div>
    <UnsafeSheet open={open} onClose={() => setOpen(false)} me={me} area={me ? loc.area : null} staleLocation={Boolean(loc.at && !me)} helpPoints={help?.key === key ? help.points : []} helpLoading={Boolean(me) && help?.key !== key} helpFailed={Boolean(help?.key === key && help.failed)} helpPartial={help?.key === key && help.evidence?.state === "partial"} onGoHelpPoint={(p) => { closeOverlayThen(() => setOpen(false), () => { setPendingDestination({ name: p.name, lat: p.lat, lon: p.lon }); router.push("/around/map"); }); }} goLabel="View" share={share} tell={tell} exclude={account.exclude} peopleLoading={account.loading} change={{ label: "Review movement options", detail: "Keep your named plan. Review a route or timing change before confirming it.", onReview: () => closeOverlayThen(() => setOpen(false), () => router.push(activeTrip ? "/trip" : "/plan")) }} />
    {sharing ? <div role="dialog" aria-modal="true" aria-labelledby="sharing-title" className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center"><section className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"><h2 id="sharing-title" className="text-xl font-semibold">Your sharing choice</h2>{account.loading ? <p role="status">Checking your contacts…</p> : !account.signedIn ? <><p className="mt-3 text-sm">Sign in for a live journey. Nobody has been contacted.</p><button type="button" onClick={() => closeOverlayThen(() => setSharing(false), () => router.push("/me"))} className="mira-primary mt-4">Sign in</button></> : <><p className="my-3 text-sm text-ink-muted">{activeTrip ? "Add only the people you select. Manage existing links in your journey." : "Start a 30-minute foreground location journey. Empty selection stays private."}</p><RecipientPicker contacts={account.contacts} selectedIds={recipientIds} onChange={(ids) => { requestKey.current = null; setRecipientIds(ids); }} disabled={busy} /><button type="button" onClick={() => void confirmShare()} disabled={busy} className="mira-primary mt-4 w-full">{busy ? "Checking…" : recipientIds.length ? "Confirm selected recipients" : activeTrip ? "Open journey" : "Start privately"}</button></>}{message ? <p role="status" className="mt-3 text-sm text-error">{message}</p> : null}<button type="button" onClick={() => setSharing(false)} disabled={busy} className="mt-2 min-h-12 w-full text-sm">Cancel</button></section></div> : null}
  </>;
}
