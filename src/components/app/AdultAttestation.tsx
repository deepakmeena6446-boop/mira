"use client";

import Link from "next/link";
import { api } from "@/lib/api-client";

/** A self-attestation only: Mira does not request or store a date of birth. */
export function AdultAttestation({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mt-4 flex items-start gap-3 text-left text-sm text-ink-muted">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-accent" />
      <span>I confirm I&apos;m 18 or older. I&apos;ve read Mira&apos;s <Link href="/terms" className="font-semibold text-accent underline">beta terms</Link> and <Link href="/privacy" className="font-semibold text-accent underline">privacy notice</Link>.</span>
    </label>
  );
}

export async function confirmAdultEligibility(): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await api("/api/auth/eligibility", { body: { adult: true } });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
