"use client";
import { useSyncExternalStore } from "react";
const EVENT = "mira:plan-step";
function subscribe(listener: () => void) { window.addEventListener("popstate", listener); window.addEventListener(EVENT, listener); return () => { window.removeEventListener("popstate", listener); window.removeEventListener(EVENT, listener); }; }
function read() { const value = new URLSearchParams(window.location.search).get("planStep"); return value === "options" ? 1 : value === "return" ? 2 : 0; }
/** Native history keeps the preceding workspace reachable without serialising plan content in URLs. */
export function usePlanStep(): [number, (step: number) => void] {
  const step = useSyncExternalStore(subscribe, read, () => 0);
  const setStep = (next: number) => { if (next === read()) return; const url = new URL(window.location.href); if (next === 0) url.searchParams.delete("planStep"); else url.searchParams.set("planStep", next === 1 ? "options" : "return"); window.history.pushState(null, "", url); window.dispatchEvent(new Event(EVENT)); };
  return [step, setStep];
}
