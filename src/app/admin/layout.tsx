import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Moderation", template: "%s · Mira moderation" }, robots: { index: false, follow: false } };

/** Moderator area: separate chrome, absent from consumer navigation (UX spec §1, §7). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-companion">
      <header className="border-b border-line/70 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <p className="flex items-center gap-3"><span className="mira-wordmark">mira<span aria-hidden>↗</span></span><span className="m-label">Moderation</span></p>
          <p className="m-meta">Restricted — authorised moderators only</p>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 outline-none">
        {children}
      </main>
    </div>
  );
}
