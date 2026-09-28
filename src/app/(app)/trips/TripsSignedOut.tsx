"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInSheet } from "@/components/app/SignInSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Trips without an account: one line of why, a sign-in, and the way to plan a journey. */
export function TripsSignedOut() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 rounded-[var(--radius-card)] bg-surface p-6 text-center shadow-[var(--shadow-card)]">
      <p className="text-ink-muted">Sign in to start a journey with Mira. The one you&apos;re on shows here, and finished ones are deleted within a day.</p>
      <Button className="mt-5" variant="hero" size="lg" onClick={() => setOpen(true)}>
        Sign in
      </Button>
      <Link href="/" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent">
        Where are you going? <Icon name="arrow" className="size-4" />
      </Link>
      <SignInSheet open={open} onClose={() => setOpen(false)} reason="Sign in to start with Mira" />
    </div>
  );
}
