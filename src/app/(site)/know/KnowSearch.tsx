"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PlacePicker } from "@/components/places/PlacePicker";
import { TimeContextPicker } from "@/components/know/TimeContextPicker";
import { RouteResult } from "@/components/know/RouteResult";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Icon } from "@/components/ui/Icon";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api-client";
import { useSelectedPlace, type PlaceSummary } from "@/lib/selection-store";
import { inBounds } from "@/domain/pilot";
import type { KnowResponse, PilotInfo } from "@/domain/know-types";
import type { TimeContext } from "@/domain/time-bands";

type LocState = "idle" | "requesting" | "ok" | "denied" | "unavailable" | "outside" | "unsupported";

export function KnowSearch({ pilot }: { pilot: PilotInfo }) {
  const handoff = useSelectedPlace();
  const [to, setTo] = useState<PlaceSummary | null>(handoff);
  const [from, setFrom] = useState<PlaceSummary | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loc, setLoc] = useState<LocState>("idle");
  const [time, setTime] = useState<TimeContext>("now");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: KnowResponse; coords: { lat: number; lon: number } | null } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const useLocation = () => {
    if (!("geolocation" in navigator)) {
      setLoc("unsupported");
      return;
    }
    setLoc("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        if (!inBounds(c)) {
          setCoords(null);
          setLoc("outside");
          return;
        }
        setCoords(c);
        setFrom(null);
        setLoc("ok");
      },
      (err) => setLoc(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const compare = async () => {
    if (!to || (!from && !coords)) return;
    setBusy(true);
    setError(null);
    const origin = from ? { placeId: from.id } : coords!;
    const res = await api<KnowResponse>("/api/know", { body: { mode: "route", origin, destination: { placeId: to.id }, time } });
    setBusy(false);
    if (res.ok) {
      setResult({ data: res.data, coords: from ? null : coords });
      requestAnimationFrame(() => resultRef.current?.focus());
    } else {
      setError(res.status === 503 ? "Route information is unavailable because the pilot map data isn't loaded." : res.message);
    }
  };

  const clearLocation = () => {
    setCoords(null);
    setLoc("idle");
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header>
        <h1 className="text-3xl font-bold">Know the area</h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          Look up a mapped place, or compare walking paths between two points in the pilot area. You&apos;ll see sources, reviewed community observations
          when there are enough, and what we don&apos;t know.
        </p>
      </header>

      <section aria-label="Choose places" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
        <PlacePicker label="Where to?" hint="Required" onPick={(p) => setTo(p)} initialValue={handoff?.name ?? ""} />

        <div className="flex flex-col gap-2">
          {coords ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-accent bg-accent-soft px-4 py-3">
              <span className="flex items-center gap-2 font-medium">
                <Icon name="locate" /> Starting from your current location
              </span>
              <button type="button" onClick={clearLocation} className="min-h-11 rounded-full px-3 text-sm font-semibold text-accent hover:bg-surface">
                Pick a place instead
              </button>
            </div>
          ) : (
            <>
              <PlacePicker label="Starting from" hint="Optional — for walking paths" onPick={(p) => setFrom(p)} />
              <div>
                <Button variant="ghost" onClick={useLocation} busy={loc === "requesting"} busyLabel="Asking your browser…">
                  <Icon name="locate" /> Use my location
                </Button>
                <p className="mt-1 text-sm text-ink-muted">Asked once, used only to find the nearest walkway, and not stored.</p>
              </div>
            </>
          )}
          {loc === "denied" ? (
            <Notice tone="neutral" role="status">
              Location permission was declined. That&apos;s fine — pick a starting place above instead.
            </Notice>
          ) : null}
          {loc === "unavailable" || loc === "unsupported" ? (
            <Notice tone="neutral" role="status">
              Your location isn&apos;t available right now. Pick a starting place above instead.
            </Notice>
          ) : null}
          {loc === "outside" ? (
            <Notice tone="attention" role="status" title="MIRA does not cover this area yet">
              Your current location is outside the pilot area (Delhi University North Campus around Vishwavidyalaya Metro). Pick a starting place in the
              pilot instead. Your location wasn&apos;t sent to MIRA.
            </Notice>
          ) : null}
        </div>

        <TimeContextPicker value={time} onChange={setTime} />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={compare} disabled={!to || (!from && !coords)} busy={busy} busyLabel="Finding mapped paths…">
            <Icon name="route" /> Compare walking paths
          </Button>
          {to ? (
            <Link
              href={`/know/place/${to.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-5 py-3.5 font-semibold hover:bg-sunken"
            >
              Place information only
            </Link>
          ) : null}
        </div>
        {!to ? <p className="text-sm text-ink-muted">Choose where you&apos;re going to continue.</p> : null}
      </section>

      {error ? (
        <Notice tone="error" role="alert" title="Couldn't get paths">
          {error}
        </Notice>
      ) : null}
      {busy && !result ? <CardSkeleton lines={4} label="Finding mapped paths" /> : null}
      <div ref={resultRef} tabIndex={-1} className="outline-none">
        {result ? <RouteResult pilot={pilot} data={result.data} originCoords={result.coords} /> : null}
      </div>
    </div>
  );
}
