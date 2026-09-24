"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FieldError, Label, TextInput } from "@/components/ui/Field";
import { api } from "@/lib/api-client";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await api("/api/admin/login", { body: { password } });
        setBusy(false);
        if (res.ok) {
          setPassword("");
          router.replace("/admin/reports");
          router.refresh();
        } else {
          setError(res.status === 429 ? "Too many attempts. Wait a few minutes before trying again." : res.network ? res.message : "That password isn't right.");
        }
      }}
    >
      <div>
        <Label htmlFor="password">Moderator password</Label>
        <TextInput id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error} aria-describedby="pw-error" required />
        <FieldError id="pw-error">{error}</FieldError>
      </div>
      <Button type="submit" busy={busy} busyLabel="Checking…" disabled={!password}>
        Sign in
      </Button>
    </form>
  );
}
