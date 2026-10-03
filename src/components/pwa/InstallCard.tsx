"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { promptInstall, useInstallState } from "./install";

/**
 * "Add Mira to your home screen". `variant="row"` lives in Me → App; `variant="card"`
 * is the one-time suggestion on Home (hidden for good once dismissed or installed).
 */
export function InstallCard({ variant, onDismiss }: { variant: "row" | "card"; onDismiss?: () => void }) {
  const state = useInstallState();
  const toast = useToast();
  const [iosHelp, setIosHelp] = useState(false);
  if (state.kind === "unavailable" || (variant === "card" && state.kind === "installed")) return null;

  if (state.kind === "installed") {
    return (
      <div className="flex min-h-14 items-center gap-3 px-5">
        <Icon name="plus" className="size-5 text-accent" />
        <span className="flex-1 font-semibold">Mira is installed on this device</span>
        <Icon name="check" className="text-mint" />
      </div>
    );
  }

  const install = async () => {
    if (state.kind === "ios") return setIosHelp((v) => !v);
    const ok = await promptInstall();
    if (ok) toast("Installed — Mira is on your home screen");
  };

  const iosSteps = iosHelp ? (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
      <li>
        Tap the <span className="font-semibold text-ink">Share</span> button <span aria-hidden>⎋</span> in Safari&apos;s toolbar
      </li>
      <li>
        Choose <span className="font-semibold text-ink">Add to Home Screen</span>
      </li>
    </ol>
  ) : null;

  if (variant === "row") {
    return (
      <div className="px-4 py-3">
        <button type="button" onClick={install} className="m-press flex min-h-12 w-full items-center gap-3 text-left">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"><Icon name="plus" className="size-[18px]" /></span>
          <span className="flex-1">
            <span className="block font-semibold">Install Mira</span>
            <span className="block text-[0.8125rem] leading-snug text-ink-muted">Opens in one tap, full screen, like any app</span>
          </span>
          <Icon name="chevron" className="size-4 text-ink-subtle" />
        </button>
        {iosSteps}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] animate-rise">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-accent"><Icon name="plus" className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">Add Mira to your home screen</p>
          <p className="text-sm text-ink-muted">One tap to open, even when you&apos;re in a hurry.</p>
          {iosSteps}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={install} className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">
              {state.kind === "ios" ? (iosHelp ? "Got it" : "Show me how") : "Install"}
            </button>
            <button type="button" onClick={onDismiss} className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-sunken">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
