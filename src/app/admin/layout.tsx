import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Moderation", template: "%s · Mira moderation" }, robots: { index: false, follow: false } };

/** Moderator area: separate chrome, absent from consumer navigation (UX spec §1, §7). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <p className="font-bold">Mira moderation</p>
          <p className="text-sm text-ink-muted">Restricted — authorised moderators only</p>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 outline-none">
        {children}
      </main>
    </div>
  );
}
