import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check-in contact invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Minimal chrome: no map, no third-party requests, nothing about the traveller's movements. */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-lg px-4 py-8">
      <p className="mb-6 flex items-center gap-2 font-bold">
        <span aria-hidden className="grid size-8 place-items-center rounded-xl bg-accent text-sm text-accent-ink">
          M
        </span>
        MIRA
      </p>
      {children}
    </main>
  );
}
