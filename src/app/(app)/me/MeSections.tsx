"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/app/Section";
import { GOOGLE_KEEPS, GoogleButton } from "@/components/app/SignInSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import { AdultAttestation, confirmAdultEligibility } from "@/components/app/AdultAttestation";

/**
 * Keep your account so she can sign in on another phone or after clearing the browser: Continue
 * with Google (first name + a protected copy of the email, nothing else), or a one-time email link.
 * Either way the first-name account is upgraded in place: places, people and journeys stay.
 */
export function AccountSection({
  durable,
  google,
  emailHint,
  emailAvailable,
  googleAvailable,
  saved,
}: {
  durable: boolean;
  /** Signed in with Google. */
  google: boolean;
  emailHint: string | null;
  emailAvailable: boolean;
  googleAvailable: boolean;
  saved: boolean;
}) {
  const [email, setEmail] = useState("");
  const [adult, setAdult] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [useEmail, setUseEmail] = useState(!googleAvailable);
  const emailForm =
    state === "sent" ? (
      <p role="status" className="text-sm">
        <strong>Check your email.</strong> Open the link on this phone to keep your account. It works once, for 20 minutes.
      </p>
    ) : (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!adult) return;
          setState("busy");
          const eligibility = await confirmAdultEligibility();
          if (!eligibility.ok) { setMessage(eligibility.message); setState("error"); return; }
          const r = await api("/api/auth/email", { body: { email: email.trim() } });
          if (r.ok) setState("sent");
          else {
            setMessage(r.message);
            setState("error");
          }
        }}
      >
        {googleAvailable ? null : <p className="text-sm text-ink-muted">Right now your account lives in this browser only. Add your email to sign in on another phone or after clearing your browser — no password.</p>}
        <label htmlFor="acct-email" className="mt-3 block text-sm font-semibold">
          Email
        </label>
        <input id="acct-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-sunken px-4 outline-none focus:border-accent" />
        <AdultAttestation checked={adult} onChange={setAdult} />
        {state === "error" ? <p className="mt-2 text-sm font-semibold text-error">{message}</p> : null}
        <Button type="submit" className="mt-3" variant={googleAvailable ? "secondary" : "primary"} size="lg" busy={state === "busy"} busyLabel="Sending…" disabled={!email.trim() || !adult}>
          Email me a link
        </Button>
      </form>
    );
  return (
    <Section id="account" title="Your account">
      <div className="p-4">
        {durable ? (
          <p className="flex items-center gap-2 text-sm">
            <Icon name="check" className="size-4 text-mint" />
            {google ? (
              <span>
                Signed in with Google{emailHint ? <> as <strong>{emailHint}</strong></> : null}. On another phone, choose Continue with Google.
              </span>
            ) : (
              <span>
                {saved ? "Email added. " : ""}Signed in with <strong>{emailHint}</strong>. You can sign in on another phone with a link to this email.
              </span>
            )}
          </p>
        ) : googleAvailable ? (
          <div>
            <p className="text-sm text-ink-muted">Right now your account lives in this browser only. Continue with Google to keep it — your places, people and journeys stay.</p>
            <GoogleButton className="mt-3" />
            <p className="mt-2 text-xs text-ink-subtle">{GOOGLE_KEEPS}</p>
            {emailAvailable ? (
              useEmail ? (
                <div className="mt-4 border-t border-line pt-1">{emailForm}</div>
              ) : (
                <button type="button" onClick={() => setUseEmail(true)} className="mt-2 min-h-11 text-sm font-semibold text-accent-strong">
                  Use email instead
                </button>
              )
            ) : null}
          </div>
        ) : !emailAvailable ? (
          <p className="text-sm text-ink-muted">This account lives in this browser only. Signing in with email isn&apos;t switched on in this version yet.</p>
        ) : (
          emailForm
        )}
      </div>
    </Section>
  );
}


function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Notifications on this phone (Web Push): missed check-in, contact accepted, location paused. */
export function PushSection({ available }: { available: boolean }) {
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on" | "denied" | "busy">("loading");
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    if (!available) return;
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    void (async () => {
      if (!supported) return setState("unsupported");
      const r = await api<{ publicKey: string | null; subscribed: boolean }>("/api/me/push");
      if (!r.ok || !r.data.publicKey) return setState("unsupported");
      setKey(r.data.publicKey);
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(Notification.permission === "denied" ? "denied" : sub && r.data.subscribed ? "on" : "off");
    })();
  }, [available]);
  if (!available) return null;

  const turnOn = async () => {
    if (!key) return;
    setState("busy");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const r = await api("/api/me/push", { body: { subscription: sub.toJSON() } });
    setState(r.ok ? "on" : "off");
  };
  const turnOff = async () => {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/me/push", { method: "DELETE", body: { endpoint: sub.endpoint } });
      await sub.unsubscribe().catch(() => false);
    }
    setState("off");
  };

  return (
    <Section id="notifications" title="Notifications">
      <div className="p-4">
        <p className="text-sm text-ink-muted">Get told on this phone, even with Mira closed: a missed check-in, someone accepting your invite, or your live location pausing. No location is in the notification.</p>
        {state === "unsupported" ? (
          <p className="mt-3 text-sm">This browser can&apos;t show notifications from Mira. On iPhone, add Mira to your Home Screen first, then open it from there.</p>
        ) : state === "denied" ? (
          <p className="mt-3 text-sm">Notifications are blocked for Mira in your browser&apos;s site settings.</p>
        ) : (
          <Button className="mt-3" variant={state === "on" ? "secondary" : "primary"} size="lg" busy={state === "busy" || state === "loading"} busyLabel="One moment…" onClick={state === "on" ? turnOff : turnOn}>
            {state === "on" ? "Turn off on this phone" : "Turn on notifications"}
          </Button>
        )}
      </div>
    </Section>
  );
}
