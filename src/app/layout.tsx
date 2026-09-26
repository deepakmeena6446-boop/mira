import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { DaypartSync } from "@/lib/daypart-store";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3100"),
  title: { default: "MIRA — walk home, your people will know", template: "%s · MIRA" },
  description: "Know more about the way before you go: lighting and Help Points on your route. Share your journey live in one tap, and have help close at hand.",
  applicationName: "MIRA",
  appleWebApp: { capable: true, title: "MIRA", statusBarStyle: "default" },
  formatDetection: { telephone: false, address: false, email: false },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  openGraph: { title: "MIRA — walk home, your people will know", description: "Lighting and Help Points on your route, your journey shared live in one tap, and help close at hand.", siteName: "MIRA", type: "website" },
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
    <html lang="en" className={jakarta.variable} data-daypart="day" suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: sets the time-of-day theme before first paint (a few hundred bytes, cached). */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/daypart.js" nonce={nonce} />
      </head>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:shadow-lg"
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
