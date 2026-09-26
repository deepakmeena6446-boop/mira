import { TabBar } from "@/components/app/TabBar";
import { SignInNotice } from "@/components/app/SignInNotice";

/** Consumer app shell: full-bleed screens with a floating tab bar. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main" tabIndex={-1} className="min-h-dvh outline-none">
        {children}
      </main>
      <TabBar />
      <SignInNotice />
    </>
  );
}
