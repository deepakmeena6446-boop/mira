import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { BottomNav, HeaderNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = {
  title: { default: "MIRA — Know more. Move freely.", template: "%s · MIRA" },
  description:
    "A privacy-first companion for moving around Delhi University North Campus: observed conditions with sources and uncertainty, private check-ins, and anonymous observations.",
  applicationName: "MIRA",
  referrer: "strict-origin-when-cross-origin",
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f5f1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:shadow-lg"
        >
          Skip to content
        </a>
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
      </body>
    </html>
  );
}
