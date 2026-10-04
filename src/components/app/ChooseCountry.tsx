"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { chooseCountry } from "@/lib/locale-store";
import type { CountryContext } from "@/domain/country-context";

/** The region in her phone's language setting ("en-IN" → IN), only when it names one: "en" alone is no hint. */
function phoneRegion(): string | null {
  try {
    for (const tag of [navigator.language, Intl.DateTimeFormat().resolvedOptions().locale]) {
      const region = tag ? new Intl.Locale(tag).region : undefined;
      if (region && /^[A-Z]{2}$/.test(region)) return region;
    }
  } catch { /* no usable locale */ }
  return null;
}

/**
 * Location off, so Mira can't tell the country: she chooses it (audit P03-003). Never a guess and never a
 * "worldwide" number — her phone's region is only offered as a suggestion she taps. Numbers come from the same
 * reviewed country profiles as a location lookup, and are labelled as her choice.
 */
export function ChooseCountry({ className }: { className?: string }) {
  const [list, setList] = useState<Array<{ iso: string; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void api<{ countries: Array<{ iso: string; name: string }> }>("/api/geo/country").then((r) => { if (live) { if (r.ok) setList(r.data.countries); else setError("Couldn't load the country list. Your phone's own emergency call still works."); } });
    return () => { live = false; };
  }, []);
  const choose = async (iso: string) => {
    if (!iso || busy) return;
    setBusy(true); setError(null);
    const r = await api<{ country: CountryContext }>(`/api/geo/country?iso=${encodeURIComponent(iso)}`);
    setBusy(false);
    if (r.ok) chooseCountry(r.data.country); else setError(r.message);
  };
  const region = phoneRegion();
  const suggested = region && list ? list.find((c) => c.iso === region) ?? null : null;
  return (
    <section aria-label="Choose your country for emergency numbers" className={cx("rounded-2xl bg-sunken p-3 text-left", className)}>
      <p className="text-sm font-semibold text-ink">Which country are you in?</p>
      <p className="mt-0.5 text-xs text-ink-muted">Mira won&apos;t guess. Choose it and Mira shows that country&apos;s reviewed numbers.</p>
      {suggested ? <button type="button" disabled={busy} onClick={() => void choose(suggested.iso)} className="mira-primary mt-3 w-full">Show numbers for {suggested.name}</button> : null}
      <label className="mt-3 block text-sm">
        <span className="text-ink-muted">{suggested ? "Somewhere else" : "Country"}</span>
        <select disabled={!list || busy} defaultValue="" onChange={(e) => void choose(e.target.value)} className="mt-1 block min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3">
          <option value="" disabled>{list ? "Choose a country…" : "Loading countries…"}</option>
          {list?.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
        </select>
      </label>
      {error ? <p role="status" className="mt-2 text-xs text-error">{error}</p> : null}
    </section>
  );
}
