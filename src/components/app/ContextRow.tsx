"use client";

import { useState, type ReactNode } from "react";

/**
 * One line of journey context: a quiet label ("Lighting", "Help") and the facts. When part of
 * the answer is "not known", `why` says why in one tap, and that the community can fill it in.
 * Use inside a <dl>.
 */
export function ContextRow({ label, children, why }: { label: string; children: ReactNode; why?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 py-1 text-sm">
      <dt className="font-semibold text-ink-subtle">{label}</dt>
      <dd className="min-w-0">
        <span className="text-ink">{children}</span>
        {why ? (
          <>
            <span className="block text-xs text-ink-subtle">
              Community can improve this ·{" "}
              <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-6 font-semibold text-accent">
                {open ? "Hide" : "Why not known?"}
              </button>
            </span>
            {open ? <span className="mt-1 block rounded-xl bg-sunken px-3 py-2 text-xs text-ink-muted">{why}</span> : null}
          </>
        ) : null}
      </dd>
    </div>
  );
}
