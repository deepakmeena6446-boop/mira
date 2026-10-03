"use client";

import { EmergencyPill } from "@/components/app/EmergencyPill";

/**
 * The help anchors (docs/launch-ux/06 §2): "I feel unsafe" and Emergency, side by side, in a fixed
 * place on Home and on the journey screen. A stable anchor — never adaptive, never covered, and
 * rendered exactly once per screen. Neutral surfaces: calm, never alarm-coloured.
 */
export function HelpCluster({ onUnsafe, compact = false }: { onUnsafe: () => void; compact?: boolean }) {
  if (compact) {
    // Root-screen header form (docs/phase1-ux/01 §2): same two anchors, quieter chrome, same place on every root.
    return (
      <div className="mira-helpcluster flex min-w-0 flex-wrap justify-end gap-1.5">
        <button type="button" onClick={onUnsafe} className="min-h-11 max-w-full rounded-full bg-surface px-3.5 text-[0.8125rem] font-semibold text-accent-strong ring-1 ring-line-strong">
          I feel unsafe
        </button>
        <EmergencyPill variant="quiet" className="min-w-0 max-w-full justify-center break-words" />
      </div>
    );
  }
  return (
    <div className="mira-helpcluster flex min-w-0 flex-wrap justify-end gap-2">
      <button type="button" onClick={onUnsafe} className="min-h-12 max-w-full rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-accent-strong shadow-[var(--shadow-float)]">
        I feel unsafe
      </button>
      <EmergencyPill className="min-w-0 max-w-full justify-center break-words" />
    </div>
  );
}
