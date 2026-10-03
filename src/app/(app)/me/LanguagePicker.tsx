"use client";

import { Chip } from "@/components/mira/Rows";
import { LANGS, LANGS_ENABLED, setLang, useLang } from "@/lib/i18n";

/** Language, on this phone. Shown only while languages are switched on for testing (docs/phase3/00 §5). */
export function LanguagePicker() {
  const lang = useLang();
  if (!LANGS_ENABLED) return null;
  return (
    <div className="px-4 py-3.5">
      <p id="lang-label" className="font-semibold">Language</p>
      <p className="text-[0.8125rem] text-ink-muted">Hindi is in testing: the tabs, Support and Home are translated first.</p>
      <div role="radiogroup" aria-labelledby="lang-label" className="mt-3 flex flex-wrap gap-2">
        {LANGS.map((l) => <Chip key={l.id} on={lang === l.id} onClick={() => setLang(l.id)}>{l.label}</Chip>)}
      </div>
    </div>
  );
}
