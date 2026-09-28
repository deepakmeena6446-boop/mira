"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import type { ImpactView } from "@/server/contributions";

/**
 * "Your impact" row for Me (signed-in only): verified counts only, links to Contribute. Pass
 * `impact` when the page already has it; otherwise it loads its own (private to her).
 */
export function ImpactRow({ impact: initial }: { impact?: ImpactView | null }) {
  const [impact, setImpact] = useState<ImpactView | null>(initial ?? null);
  useEffect(() => {
    if (initial) return;
    let live = true;
    api<{ impact: ImpactView }>("/api/contribute").then((r) => {
      if (live && r.ok) setImpact(r.data.impact);
    });
    return () => {
      live = false;
    };
  }, [initial]);
  const pending = impact?.summary.pending ?? 0;
  const sub = impact?.line ?? (pending ? `${pending} waiting for someone else to confirm` : "Help Mira know your area better");
  return (
    <Link href="/contribute" className="flex min-h-14 items-center gap-3 px-5 py-3 hover:bg-sunken">
      <Icon name="contribute" className="text-accent" />
      <span className="flex-1">
        <span className="flex items-center gap-2 font-semibold">
          Your impact
          {impact?.steward.steward ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">Local Steward</span> : null}
        </span>
        <span className="block text-sm text-ink-muted">{sub}</span>
      </span>
      <Icon name="chevron" className="size-4 text-ink-subtle" />
    </Link>
  );
}
