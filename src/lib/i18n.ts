"use client";

import { useSyncExternalStore } from "react";

/**
 * Language groundwork (docs/phase3/00 §5). English is complete; Hindi covers the chrome every screen
 * shares (tabs, the Support pair, Home's headings). The picker stays off until every screen has its
 * Hindi copy — a half-translated app would read worse than either language. QA can turn it on with
 * NEXT_PUBLIC_MIRA_LANGS=on. Copy stays gender-neutral in both languages.
 */
export type Lang = "en" | "hi";
export const LANGS: Array<{ id: Lang; label: string }> = [{ id: "en", label: "English" }, { id: "hi", label: "हिन्दी" }];
export const LANGS_ENABLED = process.env.NEXT_PUBLIC_MIRA_LANGS === "on";

export const CATALOG = {
  en: {
    "tab.home": "Home", "tab.mira": "Mira", "tab.around": "Around", "tab.journeys": "Journeys",
    "support.unsafe": "I feel unsafe", "support.emergency": "Emergency",
    "home.going": "Where are you going?", "home.noticed": "Mira noticed", "home.addHere": "Add what you see here",
    "home.purpose": "Step out with confidence.", "home.purposeLine": "Tell Mira where you're heading, or explore what matters around a place.",
    "greet.late": "Still up", "greet.morning": "Good morning", "greet.afternoon": "Good afternoon", "greet.evening": "Good evening",
  },
  hi: {
    "tab.home": "होम", "tab.mira": "मीरा", "tab.around": "आसपास", "tab.journeys": "यात्राएँ",
    "support.unsafe": "मुझे असुरक्षित लग रहा है", "support.emergency": "आपातकाल",
    "home.going": "कहाँ जा रहे हैं?", "home.noticed": "मीरा ने देखा", "home.addHere": "यहाँ जो दिखे, जोड़ें",
    "home.purpose": "भरोसे के साथ बाहर निकलें।", "home.purposeLine": "मीरा को बताइए कि कहाँ जा रहे हैं, या किसी जगह के आसपास की ज़रूरी बातें देखिए।",
    "greet.late": "अभी तक जाग रहे हैं", "greet.morning": "सुप्रभात", "greet.afternoon": "नमस्ते", "greet.evening": "शुभ संध्या",
  },
} as const satisfies Record<Lang, Record<string, string>>;
export type MessageKey = keyof (typeof CATALOG)["en"];

const KEY = "mira.lang";
const listeners = new Set<() => void>();
function read(): Lang {
  if (!LANGS_ENABLED) return "en";
  try { return localStorage.getItem(KEY) === "hi" ? "hi" : "en"; } catch { return "en"; }
}
export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* this session only */ }
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}
export function useLang(): Lang {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, read, () => "en");
}
export function translate(lang: Lang, key: MessageKey): string {
  return CATALOG[lang][key] ?? CATALOG.en[key];
}
/** `t("tab.home")` in the person's language (English until languages are switched on). */
export function useT(): (key: MessageKey) => string {
  const lang = useLang();
  return (key) => translate(lang, key);
}

/** The greeting key for an hour, matching greetingFor's English. */
export function greetingKey(hour: number): MessageKey {
  return hour < 5 ? "greet.late" : hour < 12 ? "greet.morning" : hour < 17 ? "greet.afternoon" : "greet.evening";
}
