"use client";

import { useState } from "react";
import { MiraPulse } from "./MiraPulse";
import type { MiraLine as Line } from "@/domain/mira-line";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * The Mira line (docs/launch-ux/04 §13): the Pulse mark, one calm sentence, at most one action,
 * and — on request — why Mira is saying it. A *new fact* (a changed key, not first paint) gets one
 * "noticed" ripple and a single polite announcement.
 */
export function MiraLine({ line, onAction, primary = false, className }: { line: Line; onAction?: () => void; primary?: boolean; className?: string }) {
  const [firstKey] = useState(line.key);
  const changed = firstKey !== line.key;
  // Announced once when the fact changes while she's here (not on first paint).
  const announce = changed ? line.text : "";
  const pulse = line.state === "noticed" && !changed ? "observing" : line.state;
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <MiraPulse key={line.key} size={16} state={pulse} className="mt-[5px]" />
        <p className="min-w-0 flex-1 text-[1.0625rem] font-medium leading-snug text-ink text-mixed">{line.text}</p>
      </div>
      {line.action && onAction ? (
        primary ? (
          <div className="mt-3 pl-7">
            <Button variant="primary" onClick={onAction} className="px-5">
              {line.action.label}
            </Button>
          </div>
        ) : (
          <button type="button" onClick={onAction} className="ml-7 mt-0.5 inline-flex min-h-11 items-center gap-1 font-semibold text-accent-strong">
            {line.action.label} <Icon name="chevron" className="size-4" />
          </button>
        )
      ) : null}
      {line.why ? (
        <details className="mt-1 pl-7 text-sm text-ink-muted">
          <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-ink-subtle">Why?</summary>
          <p>{line.why}</p>
        </details>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
