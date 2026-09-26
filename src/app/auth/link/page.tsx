import type { Metadata } from "next";
import { ConfirmSignIn } from "./ConfirmSignIn";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function SignInLinkPage() {
  return (
    <main id="main" className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <ConfirmSignIn />
    </main>
  );
}
