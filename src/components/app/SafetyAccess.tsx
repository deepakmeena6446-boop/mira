"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useLocation, setArea, setPendingDestination } from "@/lib/location-store";
import { setCountry, useCountry, type CountryContext } from "@/lib/locale-store";
import { useToast } from "@/components/ui/Toast";
import { shareLiveLink } from "@/lib/share";
import { recordUsage } from "@/lib/usage-signal";
import { HelpCluster } from "./HelpCluster";
import { UnsafeSheet, type UnsafeShareAction, type UnsafeTellAction } from "./UnsafeSheet";
import type { Contact } from "@/server/account/contacts";
import type { TripView } from "@/server/trips";
import type { HelpClass, HelpPoint } from "@/domain/help-points";
import { HELP_CLASSES } from "@/domain/help-points";
import type { EvidenceState } from "@/domain/evidence-state";

/** The same immediate safety entry on each non-map root. Map and Trip keep their existing controls. */
export function SafetyAccess({ emailAlerts, className = "" }: { emailAlerts: boolean; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const loc = useLocation(false);
  const country = useCountry();
  const me = loc.point ? { lat: loc.point.lat, lon: loc.point.lon } : null;
  const areaKey = me ? `${me.lat.toFixed(2)},${me.lon.toFixed(2)}` : "";
  const key = `${areaKey}|${country.iso}`;
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<{ signedIn: boolean; contacts: Contact[]; exclude: HelpClass[]; trip: TripView | null; loading: boolean }>({ signedIn: false, contacts: [], exclude: [], trip: null, loading: true });
  const [help, setHelp] = useState<{ key: string; points: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> | null; failed: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([api<{ user: { helpExclude?: string[] } | null; contacts?: Contact[] }>("/api/me"), api<{ trip: TripView | null }>("/api/trips/current")]).then(([who, current]) => {
      if (!live) return;
      const exclude = who.ok ? (who.data.user?.helpExclude ?? []).filter((x): x is HelpClass => x in HELP_CLASSES) : [];
      setAccount({ signedIn: Boolean(who.ok && who.data.user), contacts: who.ok ? who.data.contacts ?? [] : [], exclude, trip: current.ok ? current.data.trip : null, loading: false });
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!me) return;
    let live = true;
    void api<{ label: string | null; country: CountryContext }>("/api/geo/reverse", { body: me }).then((r) => {
      if (!live || !r.ok) return;
      setCountry(r.data.country);
      if (r.data.label) setArea(r.data.label);
    });
    return () => { live = false; };
    // Only recheck after meaningful movement, not after the country store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey]);

  useEffect(() => {
    if (!me) return;
    let live = true;
    void api<{ helpPoints: HelpPoint[]; evidence: EvidenceState<HelpPoint[]> }>("/api/geo/help", { body: { ...me, country: country.iso } }).then((result) => {
      if (live) setHelp({ key, points: result.ok ? result.data.helpPoints : [], evidence: result.ok ? result.data.evidence : null, failed: !result.ok });
    });
    return () => { live = false; };
    // The rounded key deliberately prevents a new request for every GPS jitter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const circle = useMemo(() => account.contacts.filter((c) => (emailAlerts && c.status === "accepted") || Boolean(c.phone && c.isDefault)), [account.contacts, emailAlerts]);
  const activeTrip = account.trip && (account.trip.state === "active" || account.trip.state === "missed") ? account.trip : null;
  const startSharing = async () => {
    if (!me) { setOpen(false); void loc.request(); return; }
    const result = await api<{ trip: TripView }>("/api/trips", { body: { from: me, share: circle.length > 0, etaMinutes: 30 } });
    if (result.ok || result.code === "trip_active") {
      recordUsage("journey");
      setOpen(false);
      router.push("/trip");
      router.refresh();
    } else toast(result.message, "error");
  };
  const share: UnsafeShareAction = activeTrip?.shareUrl
    ? { label: "Send my live link", detail: `Anyone you send it to sees you until you finish this journey.`, onShare: async () => {
        const outcome = await shareLiveLink(activeTrip.shareUrl!, activeTrip.destination.name);
        if (outcome === "copied") toast("Live link copied — paste it in a message.");
        if (outcome === "failed") toast("Couldn't share the link on this device.", "error");
      } }
    : !account.signedIn
      ? { label: "Share where I am live", detail: "Sign in first; no one is contacted now.", onShare: () => { setOpen(false); router.push("/me"); } }
      : { label: "Share where I am live", detail: "Starts a time-limited link. You choose who receives it.", onShare: startSharing };
  const tell: UnsafeTellAction | null = account.signedIn && circle.length && me ? {
    names: circle.map((c) => c.name),
    email: emailAlerts && circle.some((c) => c.status === "accepted"),
    onTell: async () => {
      let id = activeTrip?.id ?? null;
      if (!id) {
        const started = await api<{ trip: TripView }>("/api/trips", { body: { from: me, share: true, etaMinutes: 30 } });
        if (!started.ok && started.code !== "trip_active") return { error: started.message };
        id = started.ok ? started.data.trip.id : null;
        if (!id) {
          const current = await api<{ trip: TripView | null }>("/api/trips/current");
          id = current.ok ? current.data.trip?.id ?? null : null;
        }
      }
      if (!id) return { error: "Couldn't start sharing. Try sending a link or calling instead." };
      const result = await api<{ told: string[]; failed: string[]; whatsapp: Array<{ name: string; url: string }> }>(`/api/trips/${id}/checkon`, { body: {} });
      router.refresh();
      return result.ok ? result.data : { error: result.message };
    },
  } : null;

  return <>
    <div className={className}><HelpCluster onUnsafe={() => setOpen(true)} /></div>
    <UnsafeSheet
      open={open} onClose={() => setOpen(false)} me={me} area={loc.area}
      helpPoints={help?.key === key ? help.points : []}
      helpLoading={Boolean(me) && help?.key !== key}
      helpFailed={Boolean(help?.key === key && help.failed)}
      helpPartial={help?.key === key && help.evidence?.state === "partial"}
      onGoHelpPoint={(point) => { setPendingDestination({ name: point.name, lat: point.lat, lon: point.lon }); router.push("/around/map"); }}
      goLabel="View" share={share} tell={tell} exclude={account.exclude}
      peopleLoading={account.loading}
    />
  </>;
}
