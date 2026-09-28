"use client";

import { useSyncExternalStore } from "react";

/**
 * "Install Mira" support. Chrome/Android fire `beforeinstallprompt` once, early, so we
 * capture it at startup (captureInstallPrompt runs from ServiceWorkerRegister) and
 * replay it when the person taps Install. iOS Safari has no prompt API: we show the
 * Share → "Add to Home Screen" steps instead. Already-installed (standalone) hides it.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = { kind: "installed" } | { kind: "prompt" } | { kind: "ios" } | { kind: "unavailable" };

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let captured = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function captureInstallPrompt() {
  if (captured || typeof window === "undefined") return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own, calmer prompt
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

function isStandalone(): boolean {
  return installed || window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

// Snapshots must be stable objects for useSyncExternalStore.
const STATES: Record<InstallState["kind"], InstallState> = {
  installed: { kind: "installed" },
  prompt: { kind: "prompt" },
  ios: { kind: "ios" },
  unavailable: { kind: "unavailable" },
};
function snapshot(): InstallState {
  if (isStandalone()) return STATES.installed;
  if (deferred) return STATES.prompt;
  if (isIosSafari()) return STATES.ios;
  return STATES.unavailable;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => STATES.unavailable,
  );
}

/** Shows the browser's install dialog; resolves true if the person installed. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null; // a prompt can be used once
  emit();
  return outcome === "accepted";
}
