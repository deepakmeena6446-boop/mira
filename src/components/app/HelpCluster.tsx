"use client";

import { EmergencyPill } from "@/components/app/EmergencyPill";
import { useT } from "@/lib/i18n";

/**
 * The help anchors (docs/launch-ux/06 §2): "I feel unsafe" and Emergency, side by side, in a fixed
 * place on Home and on the journey screen. A stable anchor — never adaptive, never covered, and
 * rendered exactly once per screen. Neutral surfaces: calm, never alarm-coloured.
 */
export function HelpCluster({ onUnsafe, compact = false, quiet = false }: { onUnsafe: () => void; compact?: boolean; quiet?: boolean }) {
  const t = useT();
  if (quiet) {
    // Ordinary task screens (design/mira-companion-ux): the same two anchors, labelled and in the same place, joined
    // in one hairline capsule so they're always one tap away without reading as the screen's main action. Journey
    // screens keep the stronger compact form: there, support is the task. With enlarged text (200%) the two stack
    // instead of squeezing — words never break — and the 1px gap stays the divider either way.
    return (
      <div role="group" aria-label="Support" className="mira-support inline-flex max-w-full flex-wrap gap-px overflow-hidden rounded-[1.375rem] bg-line-strong/70 ring-1 ring-line-strong">
        <button type="button" data-early-tap="unsafe" onClick={onUnsafe} className="min-h-11 flex-auto bg-surface px-3.5 text-center text-[0.8125rem] font-semibold leading-tight text-accent-strong hover:bg-sunken">
          {t("support.unsafe")}
        </button>
        <EmergencyPill variant="joined" className="flex-auto" />
      </div>
    );
  }
  if (compact) {
    // Root-screen header form (docs/phase1-ux/01 §2): same two anchors, quieter chrome, same place on every root.
    return (
      <div className="mira-helpcluster flex min-w-0 flex-wrap justify-end gap-1.5">
        <button type="button" data-early-tap="unsafe" onClick={onUnsafe} className="min-h-11 max-w-full rounded-full bg-surface px-3.5 text-[0.8125rem] font-semibold text-accent-strong ring-1 ring-line-strong">
          {t("support.unsafe")}
        </button>
        <EmergencyPill variant="quiet" className="min-w-0 max-w-full justify-center break-words" />
      </div>
    );
  }
  return (
    <div className="mira-helpcluster flex min-w-0 flex-wrap justify-end gap-2">
      <button type="button" data-early-tap="unsafe" onClick={onUnsafe} className="min-h-12 max-w-full rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-accent-strong shadow-[var(--shadow-float)]">
        {t("support.unsafe")}
      </button>
      <EmergencyPill className="min-w-0 max-w-full justify-center break-words" />
    </div>
  );
}
