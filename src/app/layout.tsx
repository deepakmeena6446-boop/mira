import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Instrument_Sans, Instrument_Serif, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { DaypartSync } from "@/lib/daypart-store";

// Latin face preloaded; the Devanagari companion is fetched only when Devanagari text renders (unicode-range).
const inst = Instrument_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-inst", display: "swap" });
// Mira's voice and screen titles (one weight; preloaded with the Latin face).
const serif = Instrument_Serif({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-serif", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-deva", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3100"),
  title: { default: "Mira — your movement companion", template: "%s · Mira" },
  description: "Compare routes and timing, plan your journey, and get support along the way.",
  applicationName: "Mira",
  appleWebApp: { capable: true, title: "Mira", statusBarStyle: "default" },
  formatDetection: { telephone: false, address: false, email: false },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  openGraph: { title: "Mira — your movement companion", description: "Compare routes and timing, plan your journey, and get support along the way.", siteName: "Mira", type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // On phones, the on-screen keyboard shrinks the layout instead of covering Mira's composer and form fields.
  interactiveWidget: "resizes-content",
  // theme-color is set per time of day by DAYPART_BOOT_SCRIPT / DaypartSync (not statically).
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // per-request, from src/proxy.ts
  return (
    // data-daypart is set before paint by the inline script (device clock), so it differs from the server render.
    <html lang="en" className={`${inst.variable} ${serif.variable} ${deva.variable}`} data-daypart="day" suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: sets the time-of-day theme before first paint (a few hundred bytes, cached). */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/daypart.js" nonce={nonce} />
      </head>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:shadow-[var(--shadow-float)]"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
        <DaypartSync />
      </body>
    </html>
  );
}
