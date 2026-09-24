"use client";

import Link from "next/link";
import { useState } from "react";
import { PlacePicker } from "./PlacePicker";
import { setSelectedPlace, type PlaceSummary } from "@/lib/selection-store";
import { Icon } from "@/components/ui/Icon";

/** "Where are you going?" picker on Home. Selection is handed off in memory only. */
export function HomePlacePicker({ mapAvailable, journeysAvailable }: { mapAvailable: boolean; journeysAvailable: boolean }) {
  const [picked, setPicked] = useState<PlaceSummary | null>(null);
  if (!mapAvailable) {
    return (
      <p className="rounded-[var(--radius-control)] border border-line bg-sunken px-4 py-3 text-ink-muted">
        Place search isn&apos;t available right now because the pilot map data hasn&apos;t been loaded.
      </p>
    );
  }
  return (
    <div>
      <PlacePicker
        label="Where are you going?"
        hint="Places in the pilot area"
        onPick={(p) => {
          setPicked(p);
          setSelectedPlace(p);
        }}
      />
      {picked ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/know/place/${picked.id}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-strong"
          >
            See what&apos;s known here <Icon name="arrow" className="size-4" />
          </Link>
          {journeysAvailable ? (
            <Link
              href="/accompany"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 font-semibold hover:bg-sunken"
            >
              Set a check-in for this trip
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
