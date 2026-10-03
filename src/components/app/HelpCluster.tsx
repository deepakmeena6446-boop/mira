"use client";

import { EmergencyPill } from "@/components/app/EmergencyPill";

/**
 * The help anchors (docs/launch-ux/06 §2): "I feel unsafe" and Emergency, side by side, in a fixed
 * place on Home and on the journey screen. A stable anchor — never adaptive, never covered, and
 * rendered exactly once per screen. Neutral surfaces: calm, never alarm-coloured.
 */
export function HelpCluster({ onUnsafe }: { onUnsafe: () => void }) {
  return (
    <div className="mira-helpcluster flex min-w-0 flex-wrap justify-end gap-2">
      <button type="button" onClick={onUnsafe} className="min-h-12 max-w-full rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-accent-strong shadow-[var(--shadow-float)]">
        I feel unsafe
      </button>
      <EmergencyPill className="min-w-0 max-w-full justify-center break-words" />
    </div>
  );
}
