"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { api } from "@/lib/api-client";

export function AcceptButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  if (state === "done") {
    return (
      <Notice tone="info" role="status" title="You've accepted">
        Thank you. MIRA will email you a live link whenever they share a trip, and let you know if they don&apos;t check in. You can close this page.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {state === "error" ? (
        <Notice tone="error" role="alert">
          {message}
        </Notice>
      ) : null}
      <Button
        size="lg"
        busy={state === "busy"}
        busyLabel="Accepting…"
        onClick={async () => {
          setState("busy");
          const res = await api<{ status: string }>("/api/invites/accept", { body: {} });
          if (res.ok) setState("done");
          else {
            setMessage(res.network ? res.message : "This invitation can no longer be accepted.");
            setState("error");
          }
        }}
      >
        Accept
      </Button>
    </div>
  );
}
