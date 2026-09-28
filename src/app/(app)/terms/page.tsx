import type { Metadata } from "next";
import Link from "next/link";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Beta terms" };

export default function TermsPage() {
  return (
    <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <article className="mx-auto max-w-xl">
        <Link href="/" className="mb-4 inline-flex min-h-11 items-center gap-1 font-semibold text-ink-muted"><Icon name="back" className="size-5" /> Back</Link>
        <div className="flex items-center gap-3"><MiraOrb size={52} calm /><h1 className="text-3xl font-semibold">Mira beta terms</h1></div>
        <p className="mt-3 text-ink-muted">These explain what the public beta offers. Please read them before creating or signing into an account.</p>
        <div className="mt-6 space-y-4 text-sm text-ink-muted">
          <section className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]"><h2 className="font-semibold text-ink">Who can use it</h2><p className="mt-2">Mira accounts are for people aged 18 or older. You confirm this when signing in. Mira does not ask for your date of birth.</p></section>
          <section className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]"><h2 className="font-semibold text-ink">What Mira does</h2><p className="mt-2">Mira shows map evidence where sources have it, lets you share a trip you choose to start, and can attempt email alerts to accepted trusted contacts if you miss a check-in. Location, network, email, maps and push services can fail or be unavailable. Check the trip screen for the actual sharing and alert state.</p></section>
          <section className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]"><h2 className="font-semibold text-ink">Emergency and map information</h2><p className="mt-2">Mira is not an emergency service. It does not call or dispatch responders for you. Emergency numbers appear only where Mira has a reviewed country profile; an unknown number is shown as unknown. Help Points and lighting are incomplete map evidence, not a safety assessment. Check opening hours and local conditions yourself.</p></section>
          <section className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]"><h2 className="font-semibold text-ink">Sharing and contributions</h2><p className="mt-2">A live link shows your latest shared position to anyone who has that link until it expires. Share it only with people you trust. Submit only your own truthful observations; do not name, identify or accuse people in reports. Reports stay private while community publication is off. Mira may remove abusive content or accounts.</p></section>
          <section className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]"><h2 className="font-semibold text-ink">Your data</h2><p className="mt-2">The <Link href="/privacy" className="font-semibold text-accent underline">privacy notice</Link> explains what Mira stores, who can see a shared trip, third-party providers and deletion. You can delete your account from Me.</p></section>
        </div>
      </article>
    </div>
  );
}
