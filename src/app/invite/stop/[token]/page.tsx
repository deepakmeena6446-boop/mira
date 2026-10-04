import type { Metadata } from "next";
import { stopTokenEmail } from "@/server/account/contacts";
import { StopButton } from "./StopButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stop MIRA emails", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Where "Stop all MIRA emails to this address" in an invite or trip email lands (audit P20-001/P20-002). Opening it
 * changes nothing (mail scanners open links); the button does. The address itself is never shown.
 */
export default async function StopEmailsPage({ params }: PageProps<"/invite/stop/[token]">) {
  const { token } = await params;
  if (!stopTokenEmail(token)) {
    return (
      <section aria-labelledby="stop-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <h1 id="stop-h" className="text-2xl font-semibold">
          Link not valid
        </h1>
        <p className="mt-2 text-ink-muted">This link may have been cut off when it was copied. Open the link from the email again.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="stop-h" className="animate-rise rounded-[var(--radius-card)] bg-surface p-7 shadow-[var(--shadow-card)]">
      <h1 id="stop-h" className="text-2xl font-semibold">
        Stop emails from MIRA?
      </h1>
      <ul className="mt-4 space-y-2 text-ink-muted">
        <li>• Nobody can invite this email address to MIRA again.</li>
        <li>• If you&apos;re someone&apos;s trusted contact, MIRA stops emailing you their trip links and missed check-in alerts, and tells them so in the app.</li>
        <li>• You don&apos;t need an account. MIRA keeps only a one-way scrambled form of this address, so it can recognise it.</li>
      </ul>
      <div className="mt-6">
        <StopButton token={token} />
      </div>
    </section>
  );
}
