"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api-client";

/** One tap to use the emailed link (mail scanners open links; they don't tap buttons). */
export function ConfirmSignIn() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  return (
    <div className="w-full max-w-sm animate-rise">
      <MiraOrb size={72} />
      <h1 className="mt-5 text-2xl font-extrabold">Sign in to MIRA</h1>
      <p className="mt-2 text-ink-muted">You opened a sign-in link from your email.</p>
      {state === "error" ? <p role="alert" className="mt-4 rounded-2xl bg-error-soft px-4 py-3 text-sm font-semibold text-error">{message}</p> : null}
      <Button
        className="mt-6"
        variant="hero"
        size="lg"
        busy={state === "busy"}
        busyLabel="Signing in…"
        onClick={async () => {
          setState("busy");
          const r = await api<{ ok: true; added: boolean }>("/api/auth/email/confirm", { body: {} });
          if (r.ok) {
            try {
              localStorage.setItem("mira.welcomed", "1");
            } catch {
              /* storage unavailable */
            }
            router.replace(r.data.added ? "/me?saved=1" : "/");
            router.refresh();
          } else {
            setMessage(r.message);
            setState("error");
          }
        }}
      >
        Continue
      </Button>
    </div>
  );
}
