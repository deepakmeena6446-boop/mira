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
    // screens keep the stronger compact form: there, support is the task.
    return (
      <div role="group" aria-label="Support" className="mira-support inline-flex min-w-0 items-stretch rounded-full bg-surface/80 ring-1 ring-line-strong">
        <button type="button" data-early-tap="unsafe" onClick={onUnsafe} className="min-h-11 whitespace-nowrap rounded-l-full pl-3.5 pr-3 text-[0.8125rem] font-semibold text-accent-strong hover:bg-sunken">
          {t("support.unsafe")}
        </button>
        <span aria-hidden className="my-3 w-px shrink-0 bg-line-strong/60" />
        <EmergencyPill variant="joined" className="min-w-0" />
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
