"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "./install";

/** Registers the offline-shell service worker in production builds, and listens for installability. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    captureInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
