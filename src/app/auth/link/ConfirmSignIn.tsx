"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api-client";

type Preview = { valid: boolean; emailHint?: string | null; accountName?: string | null; switching?: boolean; adding?: boolean; signedInAs: string | null; adultConfirmed: boolean };

/**
 * One tap to use the emailed link (mail scanners open links; they don't tap buttons). Before the tap it names the
 * account the link opens, warns when that would switch this browser away from someone signed in here (audit
 * L01-001), and asks for 18+ right here when this device hasn't confirmed it — so a link opened on another phone
 * works (audit P19-001). An expired or wrong link says so at once.
 */
export function ConfirmSignIn() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [adult, setAdult] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void api<Preview>("/api/auth/email/preview", { body: {} }).then((r) => setPreview(r.ok ? r.data : { valid: true, signedInAs: null, adultConfirmed: true }));
  }, []);

  const who = preview?.accountName ? `${preview.accountName}${preview.emailHint ? ` (${preview.emailHint})` : ""}` : preview?.emailHint ?? "this account";
  const go = async () => {
    setState("busy");
    if (preview && !preview.adultConfirmed) {
      const ok = await api("/api/auth/eligibility", { body: { adult: true } });
      if (!ok.ok) { setMessage(ok.message); return setState("error"); }
    }
    const r = await api<{ ok: true; added: boolean }>("/api/auth/email/confirm", { body: preview?.switching ? { switchAccount: true } : {} });
    if (r.ok) {
      try { localStorage.setItem("mira.welcomed", "1"); } catch { /* storage unavailable */ }
      router.replace(r.data.added ? "/me?saved=1" : "/");
      router.refresh();
    } else {
      setMessage(r.message);
      setState("error");
    }
  };

  if (preview && !preview.valid) {
    return (
      <div className="w-full max-w-sm animate-rise">
        <MiraOrb size={72} />
        <h1 className="mt-5 text-2xl font-semibold">This sign-in link has expired</h1>
        <p className="mt-2 text-ink-muted">It was already used, it&apos;s more than 20 minutes old, or it isn&apos;t a Mira link. Ask for a new one where you signed in.</p>
        <Link href="/me" className="mira-primary mt-6 inline-flex w-full items-center justify-center">Go to You</Link>
      </div>
    );
  }
  return (
    <div className="w-full max-w-sm animate-rise">
      <MiraOrb size={72} />
      <h1 className="mt-5 text-2xl font-semibold">{preview?.adding ? "Add your email to Mira" : "Sign in to Mira"}</h1>
      <p className="mt-2 text-ink-muted">{preview ? (preview.adding ? `This link adds ${who} to the account signed in here, so you can sign in on another phone.` : `This link signs in as ${who}.`) : "You opened a sign-in link from your email."}</p>
      {preview?.switching ? (
        <p role="alert" className="mt-4 rounded-2xl bg-warm-soft px-4 py-3 text-left text-sm">
          <strong>You&apos;re signed in here as {preview.signedInAs}.</strong> Continuing signs this browser out of {preview.signedInAs} and into {who}. Only continue if you asked for this link yourself.
        </p>
      ) : null}
      {preview && !preview.adultConfirmed ? (
        <label className="mt-4 flex min-h-12 items-start gap-3 text-left text-sm">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 size-5 shrink-0" />
          I confirm I&apos;m 18 or older.
        </label>
      ) : null}
      {state === "error" ? <p role="alert" className="mt-4 rounded-2xl bg-error-soft px-4 py-3 text-sm font-semibold text-error">{message}</p> : null}
      <Button className="mt-6" variant="hero" size="lg" busy={state === "busy"} busyLabel="Signing in…" disabled={!preview || (!preview.adultConfirmed && !adult)} onClick={() => void go()}>
        {preview?.switching ? `Switch to ${preview.accountName ?? "this account"}` : "Continue"}
      </Button>
      {preview?.switching ? <Link href="/" className="mt-3 inline-flex min-h-12 items-center justify-center font-semibold text-accent-strong">Stay signed in as {preview.signedInAs}</Link> : null}
    </div>
  );
}
