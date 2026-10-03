"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInSheet } from "@/components/app/SignInSheet";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { Icon } from "@/components/ui/Icon";

export const WELCOMED_KEY = "mira.welcomed";
/** Compatibility entry. Permission and contact choices belong to the action that needs them. */
export function Welcome({ signedIn }: { signedIn: boolean }) {
  const router = useRouter(); const [signIn, setSignIn] = useState(false);
  const finish = () => { try { localStorage.setItem(WELCOMED_KEY, "1"); } catch { /* optional preference */ } router.replace("/"); router.refresh(); };
  return <main id="main" className="mira-workspace flex min-h-dvh flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col"><header className="mira-wordmark">mira<span aria-hidden>↗</span></header><section className="flex-1 py-12"><p className="mira-eyebrow">Your movement companion</p><h1 className="mt-4 text-5xl font-semibold leading-[1.08] tracking-tight">Your plans.<br />In motion.</h1><p className="mt-5 text-lg leading-relaxed text-ink-muted">Compare routes and timing. Keep the way there, the way back and practical support together.</p><p className="mt-5 text-sm text-ink-muted">Built for women’s everyday movement and travel. Start with a named place; an account and GPS are optional.</p></section><button type="button" onClick={finish} className="mira-primary w-full">Start my plan <Icon name="chevron" /></button>{!signedIn ? <button type="button" onClick={() => setSignIn(true)} className="min-h-12 py-3 text-sm text-ink-muted">Already use Mira? Sign in</button> : null}<SafetyAccess emailAlerts={false} className="mt-5" /></div><SignInSheet open={signIn} reason="Welcome back" onClose={() => setSignIn(false)} />
  </main>;
}
