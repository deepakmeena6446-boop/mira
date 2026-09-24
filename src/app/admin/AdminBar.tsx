"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="min-h-11 rounded-full px-4 text-sm font-semibold text-accent hover:bg-accent-soft"
      onClick={async () => {
        await api("/api/admin/logout", { body: {} });
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
