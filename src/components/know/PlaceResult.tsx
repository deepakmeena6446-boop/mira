"use client";

import { useMemo, useState } from "react";
import type { KnowResponse, PilotInfo } from "@/domain/know-types";
import type { TimeContext } from "@/domain/time-bands";
import { api } from "@/lib/api-client";
import { KnowLayout } from "./KnowLayout";
import { CommunityEvidence, MappedPlaceSection, SourcesDetails, UnknownsSection } from "./Evidence";
import { TimeContextPicker } from "./TimeContextPicker";
import { Notice } from "@/components/ui/Notice";
import { formatIstDate } from "@/lib/time";

export function PlaceResult({ pilot, initial }: { pilot: PilotInfo; initial: KnowResponse }) {
  const [data, setData] = useState(initial);
  const [time, setTime] = useState<TimeContext>(initial.time.context);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const place = data.place!;
  const markers = useMemo(() => [{ lat: place.point.lat, lon: place.point.lon, role: "place" as const }], [place.point.lat, place.point.lon]);

  const changeTime = async (t: TimeContext) => {
    setTime(t);
    setLoading(true);
    setError(null);
    const res = await api<KnowResponse>("/api/know", { body: { mode: "place", placeId: place.id, time: t } });
    setLoading(false);
    if (res.ok) setData(res.data);
    else setError(res.message);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header>
        <p className="text-sm font-semibold text-accent">{place.kind}</p>
        <h1 className="mt-1 text-3xl font-bold text-mixed">{place.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          From OpenStreetMap, snapshot {formatIstDate(data.source.snapshotDate)} · {data.time.label}
        </p>
      </header>
      <TimeContextPicker value={time} onChange={changeTime} disabled={loading} />
      {error ? (
        <Notice tone="error" role="alert" title="Couldn't update">
          {error}
        </Notice>
      ) : null}
      <KnowLayout pilot={pilot} markers={markers} mapLabel={`Map centred on ${place.name}`}>
        <div aria-busy={loading} className="flex flex-col gap-4">
          <MappedPlaceSection place={place} />
          <CommunityEvidence community={data.community} />
          <UnknownsSection unknowns={data.unknowns} />
          <SourcesDetails source={data.source} />
        </div>
      </KnowLayout>
    </div>
  );
}
