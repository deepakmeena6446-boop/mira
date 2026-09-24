import Link from "next/link";
import { BottomNav, HeaderNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";

/** Consumer chrome: header, persistent navigation and footer (UX spec §1). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg" aria-label="MIRA home">
            <span aria-hidden className="grid size-8 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-ink">
              M
            </span>
            <span className="text-lg font-bold tracking-tight">MIRA</span>
          </Link>
          <HeaderNav />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pt-5 outline-none">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
