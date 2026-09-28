import type { Metadata } from "next";
import { MiraOrb } from "@/components/app/MiraOrb";

export const metadata: Metadata = { title: "Trusted contact invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="bg-companion min-h-dvh px-5 py-10">
      <div className="mx-auto w-full max-w-md">
        <p className="mb-8 flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <MiraOrb size={34} calm /> Mira
        </p>
        {children}
      </div>
    </main>
  );
}
